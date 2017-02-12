use iron::prelude::*;
use iron::status;

use std::sync::Arc;
use std::sync::Mutex;
use std::io::Read;

use mongodb::db::Database;
use mongodb::db::ThreadedDatabase;
use mongodb;

use rustc_serialize::json;
use bson::Bson;


pub fn get_wish(req: &mut Request, db: Arc<Mutex<Database>>) -> IronResult<Response> {
    println!("get_wish");

    #[derive(RustcDecodable)]
    struct Input {
        key: String,
    }

    #[derive(RustcEncodable)]
    struct Output {
        name: String,
        mail: String,
        slots: Vec<String>,
        wish: Vec<i32>,
    }

    let mut payload = String::new();
    req.body.read_to_string(&mut payload).unwrap();

    let data: Input = match json::decode(&payload) {
        Ok(x) => x,
        Err(e) => {
            println!("get_wish: {}\n{}", e, payload);
            return Ok(Response::with(status::BadRequest));
        }
    };

    // let query = doc!{"people" => {"$elemMatch" => {"key" => (data.key.clone())}}};
    let query = doc!{"people.key" => (data.key.clone())};
    let mut options = mongodb::coll::options::FindOptions::new();
    options.projection = Some(doc!{"_id" => false});

    let event =
        match db.lock().unwrap().collection("events").find_one(Some(query), Some(options)) {
            Ok(Some(x)) => x,
            Ok(None) => {
                println!("get_wish: invalid key");
                return Ok(Response::with((status::NotFound, "invalid key")));
            }
            Err(e) => {
                println!("get_wish: {}", e);
                return Ok(Response::with((status::NotFound, format!("database error : {}", e))));
            }
        };

    let people = event.get_array("people").unwrap();
    let mut person = None;
    for p in people.iter() {
        if let &Bson::Document(ref p) = p {
            if let Ok(k) = p.get_str("key") {
                if k == &(data.key) {
                    person = Some(p);
                }
            }
        }
    }
    match person {
        None => Ok(Response::with((status::NotFound, "strange error person in None"))),
        Some(person) => {
            let json = json::encode(&Output {
                name: event.get_str("name").unwrap_or("").to_string(),
                mail: person.get_str("mail").unwrap_or("@").to_owned(),
                wish: person.get_array("wish")
                    .unwrap_or(&Vec::new())
                    .iter()
                    .map(|x| match x {
                        &Bson::I32(v) => v,
                        _ => 0,
                    })
                    .collect(),
                slots: event.get_array("slots")
                    .unwrap_or(&Vec::new())
                    .iter()
                    .map(|x| match x {
                        &Bson::String(ref v) => v.clone(),
                        _ => "".to_owned(),
                    })
                    .collect(),
            });
            let payload = match json {
                Ok(x) => x,
                Err(e) => {
                    println!("get_wish: {}", e);
                    return Ok(Response::with((status::NotFound, format!("json error : {}", e))));
                }
            };
            Ok(Response::with((status::Ok, payload)))
        }
    }
}
