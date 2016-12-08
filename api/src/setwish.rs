use iron::prelude::*;
use iron::status;
use iron::modifiers::Header;
use iron::headers::AccessControlAllowOrigin;

use std::sync::Arc;
use std::sync::Mutex;
use std::io::Read;

use mongodb::db::Database;
use mongodb::db::ThreadedDatabase;

use rustc_serialize::json;
use bson::Bson;


pub fn set_wish(req: &mut Request, db: Arc<Mutex<Database>>) -> IronResult<Response> {
    println!("set_wishes");

    #[derive(RustcDecodable)]
    struct Input {
        key: String,
        admin_key: String,
        wish: Vec<i32>,
    }

    let mut payload = String::new();
    req.body.read_to_string(&mut payload).unwrap();

    let data: Input = match json::decode(&payload) {
        Ok(x) => x,
        Err(e) => {
            println!("set_wishes: {}", e);
            return Ok(Response::with((status::BadRequest,
                                      format!("request error : {}", e),
                                      Header(AccessControlAllowOrigin::Any))));
        }
    };

    let db = db.lock().unwrap();

    match db.collection("events").find_one(Some(doc!{"people.key" => (data.key.clone())}), None) {
        Ok(Some(event)) => {
            match event.get_array("slots") {
                Ok(slots) => {
                    if slots.len() != data.wish.len() {
                        println!("set_wishes: wish length does not match with slots length");
                        return Ok(Response::with((status::NotFound,
                                                  "wish length does not match with slots length",
                                                  Header(AccessControlAllowOrigin::Any))));
                    }
                }
                Err(e) => {
                    println!("set_wishes: {}", e);
                    return Ok(Response::with((status::NotFound,
                                              format!("database error : {}", e),
                                              Header(AccessControlAllowOrigin::Any))));
                }
            }
        }
        Ok(None) => {
            println!("set_wishes: Wrong user key");
            return Ok(Response::with((status::NotFound,
                                      "wrong user key",
                                      Header(AccessControlAllowOrigin::Any))));
        }
        Err(e) => {
            println!("set_wishes: {}", e);
            return Ok(Response::with((status::NotFound,
                                      format!("database error : {}", e),
                                      Header(AccessControlAllowOrigin::Any))));
        }
    };

    if db.collection("events")
        .find_one(Some(doc!{
            "admin_key" => (data.admin_key.clone()),
            "people.key" => (data.key.clone())
        }),
                  None)
        .unwrap_or(None)
        .is_none() {
        let mut c = data.wish.clone();
        c.sort();
        for i in 0..c.len() {
            if c[i] > i as i32 {
                println!("set_wishes: unfair wish");
                return Ok(Response::with((status::BadRequest,
                                          "unfair wish",
                                          Header(AccessControlAllowOrigin::Any))));
            }
        }
    }

    let wish = Bson::Array(data.wish.iter().map(|x| Bson::I32(*x)).collect());

    match db.collection("events").update_one(doc!{"people.key" => (data.key.clone())},
                                             doc!{"$set" => {"people.$.wish" => wish}},
                                             None) {
        Ok(_) => {}
        Err(e) => {
            println!("set_wishes: {}", e);
            return Ok(Response::with((status::NotFound,
                                      format!("database error : {}", e),
                                      Header(AccessControlAllowOrigin::Any))));
        }
    };

    Ok(Response::with((status::Ok, Header(AccessControlAllowOrigin::Any))))
}
