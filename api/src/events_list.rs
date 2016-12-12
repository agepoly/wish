use iron::prelude::*;
use iron::status;

use std::sync::Arc;
use std::sync::Mutex;

use mongodb::db::Database;
use mongodb::db::ThreadedDatabase;
use mongodb;

pub fn events_list(db: Arc<Mutex<Database>>) -> IronResult<Response> {
    let mut options = mongodb::coll::options::FindOptions::new();
    options.projection = Some(doc!{"_id" => false, "name" => true});

    let result = db.lock().unwrap().collection("events").find(None, Some(options));

    match result {
        Ok(res) => {
            let res: Vec<String> = res.map(|x| {
                    match x {
                        Ok(x) => x.get_str("name").unwrap_or("<no name>").to_string(),
                        Err(e) => format!("<{}>", e),
                    }
                })
                .collect();
            let res: String = res.join(", ");
            Ok(Response::with((status::Ok, res)))
        }
        Err(e) => Ok(Response::with((status::Ok, format!("Database error {}", e)))),
    }
}
