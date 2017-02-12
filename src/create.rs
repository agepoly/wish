use util::create_mailer;

use iron::prelude::*;
use iron::status;

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

use bson::Bson;


pub fn create(req: &mut Request, db: Arc<Mutex<Database>>) -> IronResult<Response> {
    println!("create");

    #[derive(RustcDecodable)]
    struct Input {
        name: String,
        admin_mail: String,
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
        return Ok(Response::with((status::NotFound, format!("request error : {}", e))));
    }
    let data: Input = match json::decode(&payload) {
        Ok(x) => x,
        Err(e) => {
            println!("create: {}", e);
            return Ok(Response::with((status::NotFound, format!("request error : {}", e))));
        }
    };

    if data.vmin.len() != data.vmax.len() || data.vmin.len() != data.slots.len() {
        return Ok(Response::with((status::NotFound, "vmin, vmax, slots, length problem")));
    }

    if data.vmax.iter().fold(0, |acc, &x| acc + x) < (data.mails.len() as i32) {
        return Ok(Response::with((status::NotFound, "not enough room for people")));
    }

    if data.vmin.iter().fold(0, |acc, &x| acc + x) > (data.mails.len() as i32) {
        return Ok(Response::with((status::NotFound, "not enough people")));
    }

    if data.vmin.iter().zip(data.vmax.iter()).any(|(&xmin, &xmax)| xmin > xmax) {
        println!("create: vmin > vmax");
        return Ok(Response::with((status::NotFound, "there are vmin bigger than vmax")));
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
            return Ok(Response::with((status::NotFound, format!("mail error : {}", e))));
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
        .to(data.admin_mail.as_str())
        .html(content.as_str())
        .subject(format!("Wish : {}", data.name).as_str())
        .build();

    let email = match email {
        Ok(x) => x,
        Err(e) => {
            println!("create: {}", e);
            return Ok(Response::with((status::NotFound, format!("mail error : {}", e))));
        }
    };

    let result = mailer.send(email);

    if let Err(e) = result {
        println!("create: {}", e);
        return Ok(Response::with((status::NotFound, format!("mail error : {}", e))));
    }

    let doc = doc!{
        "message" => (data.message.clone()),
        "url" => (data.url.clone()),
        "name" => (data.name.clone()),
        "admin_key" => (admin_key.clone()),
        "admin_mail" => (data.admin_mail.clone()),
        "slots" => (Bson::Array(data.slots.iter().map(|s| Bson::String(s.clone())).collect())),
        "vmin" => (Bson::Array(data.vmin.iter().map(|&v| Bson::I32(v)).collect())),
        "vmax" => (Bson::Array(data.vmax.iter().map(|&v| Bson::I32(v)).collect())),
        "people" => ({
            let mut x: Vec<Bson> = Vec::new();
            for i in 0..data.mails.len() {
                let p = doc!{
                    "mail" => (data.mails[i].clone()),
                    "key" => (keys[i].clone()),
                    "sent" => 0,
                    "wish" => ({
                        let mut v = Vec::new();
                        v.resize(data.slots.len(), Bson::I32(0));
                        Bson::Array(v)
                    })
                };
                x.push(Bson::Document(p));
            }
            x
        })
    };

    let result = db.lock().unwrap().collection("events").insert_one(doc, None);

    if let Err(e) = result {
        println!("create: {}", e);
        return Ok(Response::with((status::NotFound, format!("database error : {}", e))));
    }

    Ok(Response::with(status::Ok))
}
