use util::create_mailer;

use iron::prelude::*;
use iron::status;

use std::sync::Arc;
use std::sync::Mutex;
use std::io::Read;

use mongodb::db::Database;
use mongodb::db::ThreadedDatabase;
use mongodb;

use rustc_serialize::json;

use lettre::email::EmailBuilder;
use lettre::transport::EmailTransport;

use bson::{Document, Bson};

pub fn get_data(req: &mut Request, db: Arc<Mutex<Database>>) -> IronResult<Response> {
    println!("get_data");

    #[derive(RustcDecodable)]
    struct Input {
        key: String,
    }

    #[derive(RustcEncodable)]
    struct Output {
        name: String,
        mails: Vec<String>,
        sent: Vec<i32>,
        slots: Vec<String>,
        vmin: Vec<i32>,
        vmax: Vec<i32>,
        wishes: Vec<Vec<i32>>,
        error: String,
    }

    let mut payload = String::new();
    req.body.read_to_string(&mut payload).unwrap();

    let data: Input = match json::decode(&payload) {
        Ok(x) => x,
        Err(e) => {
            println!("get_data: {}\n{}", e, payload);
            return Ok(Response::with((status::BadRequest, "input data parsing")));
        }
    };

    let mut options = mongodb::coll::options::FindOptions::new();
    options.projection = Some(doc!{"_id" => false});

    let event = {
        let db = db.lock().unwrap();
        match db.collection("events")
            .find_one(Some(doc!{"admin_key" => (data.key.clone())}), Some(options)) {
            Ok(Some(x)) => x,
            Ok(None) => {
                println!("get_data: invalid key");
                return Ok(Response::with((status::NotFound, "invalid key")));
            }
            Err(e) => {
                println!("get_data: {}", e);
                return Ok(Response::with((status::NotFound, format!("database error : {}", e))));
            }
        }
    };

    let url = event.get_str("url").unwrap_or("wish.com");
    let name = event.get_str("name").unwrap_or("no name");
    let amail = event.get_str("amail").unwrap_or("");
    let message = event.get_str("message").unwrap_or("");

    let mut mailer = match create_mailer(true) {
        Ok(x) => x,
        Err(e) => {
            println!("get_data: {}", e);
            return Ok(Response::with((status::NotFound, format!("mail error : {}", e))));
        }
    };

    let mut error = String::new();
    let mut people = event.get_array("people").unwrap_or(&Vec::new()).clone();

    for p in people.iter_mut() {
        if let &mut Bson::Document(ref mut x) = p {

            if match x.get("sent") {
                None => true,
                Some(&Bson::I32(y)) => y == 0,
                Some(&Bson::Boolean(y)) => !y,
                _ => false,
            } {
                let email = EmailBuilder::new()
                    .to(x.get_str("mail").unwrap_or(""))
                    .from("wish@epfl.ch")
                    .reply_to(amail)
                    .html(format!(r#"<p>Hi,</p>
<p>You have been invited by {amail} to give your wishes about the event :
<strong>{name}</strong></p>
<pre>{message}</pre>

<p><a href="{url}/wish#{key}">Click here</a> to set your wishes.</p>

<p>Have a nice day,<br />
The Wish team</p>"#,
                                  amail = amail,
                                  name = name,
                                  message = message,
                                  url = url,
                                  key = x.get_str("key").unwrap_or(""))
                        .as_str())
                    .subject(format!("Wish : {}", name).as_str())
                    .build();
                match email {
                    Ok(email) => {
                        if let Err(e) = mailer.send(email) {
                            x.insert("sent", 0i32);
                            error = format!("error when send mail to {} : {}",
                                            x.get_str("mail").unwrap_or(""),
                                            e);
                        } else {
                            x.insert("sent", 1i32);
                        }
                    }
                    Err(e) => {
                        return Ok(Response::with((status::NotFound, format!("mail : {}", e))))
                    }
                }
            }
        }
    }

    // Explicitly close the SMTP transaction as we enabled connection reuse
    mailer.close();

    let mut document = Document::new();
    document.insert("people", Bson::Array(people.clone()));

    if let Err(e) = db.lock()
        .unwrap()
        .collection("events")
        .update_one(doc!{"admin_key" => (data.key.clone())},
                    doc!{"$set" => document},
                    None) {
        println!("get_data: {}", e);
        return Ok(Response::with((status::NotFound, format!("database error : {}", e))));
    }

    let json = json::encode(&Output {
        name: event.get_str("name").unwrap_or("").to_string(),
        mails: event.get_array("people")
            .unwrap_or(&Vec::new())
            .iter()
            .map(|p| match p {
                &Bson::Document(ref x) => x.get_str("mail").unwrap_or("").to_owned(),
                _ => "".to_owned(),
            })
            .collect(),
        sent: people.iter()
            .map(|p| match p {
                &Bson::Document(ref x) => x.get_i32("sent").unwrap_or(0),
                _ => 0,
            })
            .collect(),
        wishes: event.get_array("people")
            .unwrap_or(&Vec::new())
            .iter()
            .map(|p| match p {
                &Bson::Document(ref x) => {
                    x.get_array("wish")
                        .unwrap_or(&Vec::new())
                        .iter()
                        .map(|x| match x {
                            &Bson::I32(v) => v,
                            _ => 0,
                        })
                        .collect()
                }
                _ => Vec::new(),
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
        vmin: event.get_array("vmin")
            .unwrap_or(&Vec::new())
            .iter()
            .map(|x| match x {
                &Bson::I32(ref v) => v.clone(),
                _ => 0,
            })
            .collect(),
        vmax: event.get_array("vmax")
            .unwrap_or(&Vec::new())
            .iter()
            .map(|x| match x {
                &Bson::I32(ref v) => v.clone(),
                _ => 0,
            })
            .collect(),
        error: error,
    });
    let payload = match json {
        Ok(x) => x,
        Err(e) => {
            println!("get_data: {}", e);
            return Ok(Response::with((status::NotFound, format!("json error : {}", e))));
        }
    };
    Ok(Response::with((status::Ok, payload)))
}
