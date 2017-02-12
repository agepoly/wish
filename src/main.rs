extern crate iron;
extern crate router;

#[macro_use(bson, doc)]
extern crate bson;
extern crate mongodb;

extern crate rustc_serialize;
extern crate rand;
extern crate time;
extern crate lettre;

mod config;
mod util;
mod create;
mod get_wish;
mod set_wish;
mod get_data;
mod set_data;
mod notify;
mod events_list;

use iron::prelude::*;
use iron::status;
use iron::mime::Mime;

use router::Router;
use std::sync::{Arc, Mutex};
use mongodb::{Client, ThreadedClient};
use mongodb::db::{Database, ThreadedDatabase};
use std::env;

use std::fs::File;
use std::io::prelude::*;

fn main() {
    let client = Client::connect("db", 27017).expect("Failed to initialize mongodb client.");
    client.db("wish").collection("events").find(None, None).expect("Failed to connect to mongodb");

    let db: Arc<Mutex<Database>> = Arc::new(Mutex::new(client.db("wish")));

    let mut router = Router::new();

    let arc = db.clone();
    router.post("/create",
                move |r: &mut Request| create::create(r, arc.clone()),
                "create");

    let arc = db.clone();
    router.post("/set_wish",
                move |r: &mut Request| set_wish::set_wish(r, arc.clone()),
                "set_wish");

    let arc = db.clone();
    router.post("/get_wish",
                move |r: &mut Request| get_wish::get_wish(r, arc.clone()),
                "get_wish");

    let arc = db.clone();
    router.post("/set_data",
                move |r: &mut Request| set_data::set_data(r, arc.clone()),
                "set_data");

    let arc = db.clone();
    router.post("/get_data",
                move |r: &mut Request| get_data::get_data(r, arc.clone()),
                "get_data");

    let arc = db.clone();
    router.post("/notify",
                move |r: &mut Request| notify::notify(r, arc.clone()),
                "notify");

    let arc = db.clone();
    router.get("/events_list",
               move |_: &mut Request| events_list::events_list(arc.clone()),
               "events_list");

    router.get("/:file",
               |r: &mut Request| {
        let ref query = r.extensions
            .get::<Router>()
            .unwrap()
            .find("file")
            .unwrap_or("home.html");
        load_file(query.to_string())
    },
               "file");

    router.get("/",
               |_: &mut Request| load_file("home.html".to_string()),
               "home");

    fn load_file(mut file: String) -> IronResult<Response> {
        if !file.contains(".") {
            file += ".html";
        }
        let ext = file.split(".").last().unwrap();
        let content_type: Result<Mime, _> = if ext == "js" {
                "application/javascript"
            } else if ext == "css" {
                "text/css"
            } else if ext == "ico" {
                "image/x-icon"
            } else {
                "text/html"
            }
            .parse();

        if let Ok(content_type) = content_type {
            if let Ok(mut f) = File::open(env::args().nth(2).unwrap_or(".".to_string()) + "/" +
                                          file.as_str()) {
                let mut s = Vec::new();
                f.read_to_end(&mut s).unwrap();
                return Ok(Response::with((status::Ok, content_type, s)));
            } else {
                println!("Cannot read file {:?}", file);
            }
        } else {
            println!("Cannot get mime of {:?}", file);
        }

        Ok(Response::with((status::NotFound,)))
    }

    println!("started");
    Iron::new(router).http(env::args().nth(1).unwrap_or("api:3000".to_string()).as_str()).unwrap();
}
