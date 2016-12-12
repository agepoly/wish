extern crate iron;
extern crate router;

#[macro_use(bson, doc)]
extern crate bson;
extern crate mongodb;

extern crate rustc_serialize;
extern crate rand;
extern crate time;
extern crate lettre;

mod solver;
mod config;
mod util;
mod create;
mod getdata;
mod setwish;
mod getadmindata;
mod adminupdate;
mod notify;
mod events_list;

use iron::prelude::*;
use iron::status;
use iron::mime::Mime;

use router::Router;
use std::sync::{Arc, Mutex};
use mongodb::{Client, ThreadedClient};
use mongodb::db::{Database, ThreadedDatabase};
use bson::Bson;
use std::env;

use lettre::email::EmailBuilder;
use lettre::transport::EmailTransport;
use util::create_mailer;

use std::fs::File;
use std::io::prelude::*;
use std::collections::BTreeMap;

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
                move |r: &mut Request| setwish::set_wish(r, arc.clone()),
                "set_wish");

    let arc = db.clone();
    router.post("/get_data",
                move |r: &mut Request| getdata::get_data(r, arc.clone()),
                "get_data");

    let arc = db.clone();
    router.post("/get_admin_data",
                move |r: &mut Request| getadmindata::get_admin_data(r, arc.clone()),
                "get_admin_data");

    let arc = db.clone();
    router.post("/admin_update",
                move |r: &mut Request| adminupdate::admin_update(r, arc.clone()),
                "admin_update");

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
            .unwrap_or("index.html");
        load_file(query.to_string())
    },
               "file");
    router.get("/",
               |_: &mut Request| load_file("index.html".to_string()),
               "index");

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

    let arc = db.clone();
    let handler = std::thread::spawn(move || {
        loop {
            process(&arc);
            std::thread::sleep(std::time::Duration::from_secs(10));
        }
    });

    Iron::new(router).http(env::args().nth(1).unwrap_or("api:3000".to_string()).as_str()).unwrap();
    handler.join().unwrap();
}

fn process(db: &Arc<Mutex<Database>>) {
    let time = time::get_time().sec;

    let query = doc!{"deadline" => {"$lt" => time}, "results" => (Bson::Null)};

    let event = {
        let db = db.clone();
        let db = match db.lock() {
            Ok(x) => x,
            Err(_) => return,
        };
        db.collection("events").find_one(Some(query), None)
    };

    println!("check {:?}", event);

    if let Ok(Some(event)) = event {
        let mut vmin: Vec<u32> = event.get_array("vmin")
            .unwrap_or(&Vec::new())
            .iter()
            .map(|x| match x {
                &Bson::I32(v) => v as u32,
                _ => 0,
            })
            .collect();
        let mut vmax: Vec<u32> = event.get_array("vmax")
            .unwrap_or(&Vec::new())
            .iter()
            .map(|x| match x {
                &Bson::I32(v) => v as u32,
                _ => 0,
            })
            .collect();
        if vmin.len() < vmax.len() {
            vmin.resize(vmax.len(), 0);
        }
        if vmax.len() < vmin.len() {
            vmax.resize(vmin.len(), std::u32::MAX);
        }
        let mut wishes: Vec<Vec<u32>> = event.get_array("people")
            .unwrap_or(&Vec::new())
            .iter()
            .map(|p| {
                match p {
                    &Bson::Document(ref p) => {
                        p.get_array("wish")
                            .unwrap_or(&Vec::new())
                            .iter()
                            .map(|x| {
                                match x {
                                    &Bson::I32(v) => v as u32,
                                    _ => 0,
                                }
                            })
                            .collect()
                    }
                    _ => Vec::new(),
                }
            })
            .collect();
        for wish in wishes.iter_mut() {
            wish.resize(vmin.len(), vmin.len() as u32 - 1);
        }

        let results = || -> Result<(Vec<usize>, i32), String> {
            let results = solver::search_solution(&vmin, &vmax, &wishes, 20f64);
            let db = match db.lock() {
                Ok(x) => x,
                Err(r) => return Err(format!("Database {:?}", r)),
            };

            match results {
                Ok((x, s)) => {
                    let bson_results =
                        Bson::Array(x[0].iter().map(|&x| Bson::I32(x as i32)).collect());
                    db.collection("events")
                        .update_one(doc!{"_id" => (event.get_object_id("_id").unwrap().clone())},
                                    doc!{"$set" => {"results" => bson_results}},
                                    None)
                        .unwrap();
                    Ok((x[0].clone(), s))
                }
                Err(e) => {
                    db.collection("events")
                        .update_one(doc!{"_id" => (event.get_object_id("_id").unwrap().clone())},
                                    doc!{"$set" => {"results" => (Bson::Boolean(false))}},
                                    None)
                        .unwrap();
                    Err(format!("Solver {}", e))
                }
            }
        }();


        let mut mailer = match create_mailer(false) {
            Ok(x) => x,
            Err(e) => {
                println!("process: mailer {}", e);
                return;
            }
        };

        let amail = event.get_str("amail").unwrap_or("@");
        let url = event.get_str("url").unwrap_or("www");
        let admin_key = event.get_str("admin_key").unwrap_or("");
        let name = event.get_str("name").unwrap_or("no name");

        match results {
            Ok((res, score)) => {
                let mut stats: BTreeMap<u32, i32> = BTreeMap::new();
                for i in 0..wishes.len() {
                    let grade = wishes[i][res[i] as usize];
                    *stats.entry(grade).or_insert(0) += 1;
                }
                let suffix = ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"];
                let stats: Vec<String> = stats.iter()
                    .map(|(&k, &c)| if c != 0 {
                        format!("{} participant{} in {} {}{} wish",
                                c,
                                if c > 1 { "s" } else { "" },
                                if c > 1 { "their" } else { "his/her" },
                                k + 1,
                                suffix[((k + 1) % 10) as usize])
                    } else {
                        "".to_string()
                    })
                    .collect();
                let stats = stats.join(", ");

                let email = EmailBuilder::new()
                    .from("wish@epfl.ch")
                    .to(amail)
                    .html(format!(r#"<p>Hi,</p>
<p>The event <strong>{name}</strong> has reached the deadline.<br />
The results have been computed and are accessible on any user page.<br />
On the admin page, any modification will reset the results and new ones will be computed.</p>

<p><a href="http://{url}/admin#{key}">Click here</a> to administrate the event
or to send an email to the participants informing them that the results have been computed.</p>

<p>The global reached score is {score} (less is best).</p>
<p>{stats}.</p>

<p>Have a nice day,<br />
The Wish team</p>"#,
                                  url = url,
                                  key = admin_key,
                                  name = name,
                                  score = score,
                                  stats = stats)
                        .as_str())
                    .subject(format!("Wish : {}", name).as_str())
                    .build();
                if let Ok(email) = email {
                    if let Err(_) = mailer.send(email) {
                        println!("mail error");
                    }
                }
            }
            Err(e) => {
                let email = EmailBuilder::new()
                    .from("wish@epfl.ch")
                    .to(amail)
                    .html(format!(r#"<p>Hi,</p>
<p>The event <strong>{name}</strong> has reached the deadline.<br />
An error has occured : <em>{error}</em><br />
On the admin page, any modification will reset the results and new ones will be computed.</p>

<p><a href="http://{url}/admin#{key}">Click here</a> to administrate the event.</p>

<p>Have a nice day,<br />
The Wish team</p>"#,
                                  url = url,
                                  key = admin_key,
                                  name = name,
                                  error = e)
                        .as_str())
                    .subject(format!("Wish : {}", name).as_str())
                    .build();
                if let Ok(email) = email {
                    if let Err(_) = mailer.send(email) {
                        println!("mail error");
                    }
                }
            }
        };
    }
}
