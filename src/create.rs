use util::create_mailer;

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
use rustc_serialize::hex::ToHex;

use rand;
use rand::Rng;

use lettre::email::EmailBuilder;
use lettre::transport::EmailTransport;

use bson::{Document, Bson};


pub fn create(req: &mut Request, db: Arc<Mutex<Database>>) -> IronResult<Response> {
    println!("create");

    #[derive(RustcDecodable)]
    struct Input {
        name: String,
        deadline: i64,
        amail: String,
        mails: Vec<String>,
        slots: Vec<String>,
        vmin: Vec<i32>,
        vmax: Vec<i32>,
        url: String,
        message: String,
    }

    let mut payload = String::new();
    if let Err(e) = req.body.read_to_string(&mut payload) {
        println!("create: {}", e);
        return Ok(Response::with((status::NotFound,
                                  format!("request error : {}", e),
                                  Header(AccessControlAllowOrigin::Any))));
    }
    let data: Input = match json::decode(&payload) {
        Ok(x) => x,
        Err(e) => {
            println!("create: {}", e);
            return Ok(Response::with((status::NotFound,
                                      format!("request error : {}", e),
                                      Header(AccessControlAllowOrigin::Any))));
        }
    };

    if data.vmin.len() != data.vmax.len() || data.vmin.len() != data.slots.len() {
        return Ok(Response::with((status::NotFound,
                                  "vmin, vmax, slots, length problem",
                                  Header(AccessControlAllowOrigin::Any))));
    }

    if data.vmax.iter().fold(0, |acc, &x| acc + x) < (data.mails.len() as i32) {
        return Ok(Response::with((status::NotFound,
                                  "not enough room for people",
                                  Header(AccessControlAllowOrigin::Any))));
    }

    if data.vmin.iter().fold(0, |acc, &x| acc + x) > (data.mails.len() as i32) {
        return Ok(Response::with((status::NotFound,
                                  "not enough people",
                                  Header(AccessControlAllowOrigin::Any))));
    }

    if data.vmin.iter().zip(data.vmax.iter()).any(|(&xmin, &xmax)| xmin > xmax) {
        println!("create: vmin > vmax");
        return Ok(Response::with((status::NotFound,
                                  "there are vmin bigger than vmax",
                                  Header(AccessControlAllowOrigin::Any))));
    }

    let mut keys: Vec<String> = Vec::with_capacity(data.mails.len());
    {
        let db = db.lock().unwrap();
        for _ in 0..data.mails.len() {
            loop {
                let mut key: [u8; 16] = [0; 16];
                rand::thread_rng().fill_bytes(&mut key);
                let key = key.to_hex();
                if keys.contains(&key) {
                    continue;
                }
                if db.collection("events")
                    .find_one(Some(doc!{"people.key" => (key.clone())}), None)
                    .unwrap_or(None)
                    .is_some() {
                    continue;
                }
                keys.push(key);
                break;
            }
        }
    }

    let admin_key = {
        let db = db.lock().unwrap();

        let mut admin_key: String;
        loop {
            let mut key: [u8; 16] = [0; 16];
            rand::thread_rng().fill_bytes(&mut key);
            admin_key = key.to_hex();
            if db.collection("events")
                .find_one(Some(doc!{"admin_key" => (admin_key.clone())}), None)
                .unwrap_or(None)
                .is_none() {
                break;
            }
        }
        admin_key
    };

    let mut mailer = match create_mailer(false) {
        Ok(x) => x,
        Err(e) => {
            println!("create: {}", e);
            return Ok(Response::with((status::NotFound,
                                      format!("mail error : {}", e),
                                      Header(AccessControlAllowOrigin::Any))));
        }
    };

    let content = format!(r#"<p>Hi,</p>
<p>An event has been created with your email address.<br />
<strong>If you are not concerned, please do not click on the following url.</strong><br />
<a href="{url}/admin#{key}">Click here</a> to administrate the activity.
The first time that this administration page is opened,
the invitation mails are sent to the participants.</p>

<p>Have a nice day,<br />
The Wish team</p>"#,
                  url = data.url.as_str(),
                  key = admin_key.as_str());

    let email = EmailBuilder::new()
        .from("wish@epfl.ch")
        .to(data.amail.as_str())
        .html(content.as_str())
        .subject(format!("Wish : {}", data.name).as_str())
        .build();

    let email = match email {
        Ok(x) => x,
        Err(e) => {
            println!("create: {}", e);
            return Ok(Response::with((status::NotFound,
                                      format!("mail error : {}", e),
                                      Header(AccessControlAllowOrigin::Any))));
        }
    };

    let result = mailer.send(email);

    if let Err(e) = result {
        println!("create: {}", e);
        return Ok(Response::with((status::NotFound,
                                  format!("mail error : {}", e),
                                  Header(AccessControlAllowOrigin::Any))));
    }


    let mut doc = Document::new();
    doc.insert_bson("message".to_string(), Bson::String(data.message.clone()));
    doc.insert_bson("url".to_owned(), Bson::String(data.url.clone()));
    doc.insert_bson("name".to_owned(), Bson::String(data.name.clone()));
    doc.insert_bson("admin_key".to_owned(), Bson::String(admin_key.clone()));
    doc.insert_bson("amail".to_owned(), Bson::String(data.amail.clone()));
    doc.insert_bson("deadline".to_owned(), Bson::I64(data.deadline));
    doc.insert_bson("slots".to_owned(),
                    Bson::Array(data.slots.iter().map(|s| Bson::String(s.clone())).collect()));
    doc.insert_bson("vmin".to_owned(),
                    Bson::Array(data.vmin.iter().map(|&v| Bson::I32(v)).collect()));
    doc.insert_bson("vmax".to_owned(),
                    Bson::Array(data.vmax.iter().map(|&v| Bson::I32(v)).collect()));
    doc.insert_bson("people".to_owned(), {
        let mut x: Vec<Bson> = Vec::with_capacity(data.mails.len());
        for i in 0..data.mails.len() {
            let mut p = Document::new();
            p.insert_bson("mail".to_owned(), Bson::String(data.mails[i].clone()));
            p.insert_bson("key".to_owned(), Bson::String(keys[i].clone()));
            p.insert_bson("sent".to_owned(), Bson::I32(0));

            p.insert_bson("wish".to_owned(), {
                let mut v = Vec::new();
                v.resize(data.slots.len(), Bson::I32(0));
                Bson::Array(v)
            });
            x.push(Bson::Document(p));
        }
        Bson::Array(x)
    });

    let result = db.lock().unwrap().collection("events").insert_one(doc, None);

    if let Err(e) = result {
        println!("create: {}", e);
        return Ok(Response::with((status::NotFound,
                                  format!("database error : {}", e),
                                  Header(AccessControlAllowOrigin::Any))));
    }

    Ok(Response::with((status::Ok, Header(AccessControlAllowOrigin::Any))))
}
