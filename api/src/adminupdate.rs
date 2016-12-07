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

use bson::{Document, Bson};

pub fn admin_update(req: &mut Request, db: Arc<Mutex<Database>>) -> IronResult<Response> {
    println!("admin_update");

    #[derive(RustcDecodable)]
    struct Input {
        key: String,
        deadline: i64,
        slots: Vec<String>,
        vmin: Vec<i32>,
        vmax: Vec<i32>,
        sendmail: bool
    }

    let mut payload = String::new();
    req.body.read_to_string(&mut payload).unwrap();

    let data: Input = match json::decode(&payload) {
        Ok(x) => x,
        Err(e) => {
            println!("admin_update: {}\n{}", e, payload);
            return Ok(Response::with((status::BadRequest, Header(AccessControlAllowOrigin::Any))));
        }
    };

    let event = {
        let db = db.lock().unwrap();
        match db.collection("events")
            .find_one(Some(doc!{"admin_key" => (data.key.clone())}), None) {
            Ok(Some(x)) => x,
            Ok(None) => {
                println!("admin_update: invalid key");
                return Ok(Response::with((status::BadRequest,
                                          "invalid key",
                                          Header(AccessControlAllowOrigin::Any))));
            }
            Err(e) => {
                println!("admin_update: {}", e);
                return Ok(Response::with((status::BadRequest,
                                          format!("database {}", e),
                                          Header(AccessControlAllowOrigin::Any))));
            }
        }
    };

    if data.vmin.len() != data.vmax.len() || data.vmin.len() != data.slots.len() {
        return Ok(Response::with((status::NotFound,
                                  "vmin, vmax, slots, length problem",
                                  Header(AccessControlAllowOrigin::Any))));
    }

    if data.vmax.iter().fold(0, |acc, &x| acc + x) <
       (event.get_array("people").unwrap_or(&Vec::new()).len() as i32) {
        return Ok(Response::with((status::NotFound,
                                  "not enough room for people",
                                  Header(AccessControlAllowOrigin::Any))));
    }

    if data.vmin.iter().fold(0, |acc, &x| acc + x) >
       (event.get_array("people").unwrap_or(&Vec::new()).len() as i32) {
        return Ok(Response::with((status::NotFound,
                                  "not enough people",
                                  Header(AccessControlAllowOrigin::Any))));
    }


    if data.vmax.len() != data.vmin.len() || data.vmax.len() != data.slots.len() {
        println!("admin_update: array size problem");
        return Ok(Response::with((status::BadRequest,
                                  "vmin, vmax and slots must have the same size",
                                  Header(AccessControlAllowOrigin::Any))));
    }

    if data.vmin.iter().zip(data.vmax.iter()).any(|(&xmin, &xmax)| xmin > xmax) {
        println!("admin_update: vmin > vmax");
        return Ok(Response::with((status::BadRequest,
                                  "there are vmin bigger than vmax",
                                  Header(AccessControlAllowOrigin::Any))));
    }

    let mut document = Document::new();
    document.insert("deadline", Bson::I64(data.deadline));
    document.insert("slots",
                    Bson::Array(data.slots.iter().map(|s| Bson::String(s.clone())).collect()));
    document.insert("vmin",
                    Bson::Array(data.vmin.iter().map(|&x| Bson::I32(x)).collect()));
    document.insert("vmax",
                    Bson::Array(data.vmax.iter().map(|&x| Bson::I32(x)).collect()));
    document.insert("results", Bson::Null);

    return match db.lock()
        .unwrap()
        .collection("events")
        .update_one(doc!{"admin_key" => (data.key.clone())},
                    doc!{"$set" => document},
                    None) {
        Ok(_) => {
            if data.sendmail {

            }
            Ok(Response::with((status::Ok, Header(AccessControlAllowOrigin::Any))))
        }
        Err(e) => {
            println!("admin_update: {}", e);
            Ok(Response::with((status::NotFound,
                               format!("database error : {}", e),
                               Header(AccessControlAllowOrigin::Any))))
        }
    };
}
