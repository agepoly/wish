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

use lettre::email::EmailBuilder;
use lettre::transport::EmailTransport;

use bson::Bson;

use time;

pub fn notify(req: &mut Request, db: Arc<Mutex<Database>>) -> IronResult<Response> {
    println!("notify");

    #[derive(RustcDecodable)]
    struct Input {
        key: String,
        message: String,
    }

    let mut payload = String::new();
    if let Err(e) = req.body.read_to_string(&mut payload) {
        println!("notify: {}", e);
        return Ok(Response::with((status::NotFound,
                                  format!("request error : {}", e),
                                  Header(AccessControlAllowOrigin::Any))));
    }
    let data: Input = match json::decode(&payload) {
        Ok(x) => x,
        Err(e) => {
            println!("notify: {}", e);
            return Ok(Response::with((status::NotFound,
                                      format!("request error : {}", e),
                                      Header(AccessControlAllowOrigin::Any))));
        }
    };

    let event = match db.lock()
        .unwrap()
        .collection("events")
        .find_one(Some(doc!{"admin_key" => (data.key.clone())}), None) {
        Err(e) => {
            println!("notify: {}", e);
            return Ok(Response::with((status::NotFound,
                                      format!("database error : {}", e),
                                      Header(AccessControlAllowOrigin::Any))));
        }
        Ok(None) => {
            println!("notify: invalid key");
            return Ok(Response::with((status::NotFound,
                                      "invalid key",
                                      Header(AccessControlAllowOrigin::Any))));
        }
        Ok(Some(x)) => x,
    };

    let mut mailer = match create_mailer(true) {
        Ok(x) => x,
        Err(e) => {
            println!("notify: {}", e);
            return Ok(Response::with((status::NotFound,
                                      format!("mail error : {}", e),
                                      Header(AccessControlAllowOrigin::Any))));
        }
    };

    let url = event.get_str("url").unwrap_or("wish.com");
    let name = event.get_str("name").unwrap_or("no name");
    let amail = event.get_str("amail").unwrap_or("");
    let deadline =
        time::strftime("%d %B %Y at %H:%M UTC",
                       &time::at_utc(time::Timespec::new(event.get_i64("deadline").unwrap_or(0), 0)))
            .unwrap();
    let slots: Vec<String> = event.get_array("slots")
        .unwrap_or(&Vec::new())
        .iter()
        .map(|x| match x {
            &Bson::String(ref v) => v.clone(),
            _ => "".to_string(),
        })
        .collect();
    let results: Vec<i32> = event.get_array("results")
        .unwrap_or(&Vec::new())
        .iter()
        .map(|x| match x {
            &Bson::I32(v) => v,
            _ => 0,
        })
        .collect();

    let people = event.get_array("people").unwrap_or(&Vec::new()).clone();

    let mut errors = Vec::new();


    for (i, p) in people.iter().enumerate() {
        if let &Bson::Document(ref x) = p {
            let mail = x.get_str("mail").unwrap_or("");
            let key = x.get_str("key").unwrap_or("");
            let sent = x.get_i32("sent").unwrap_or(0);

            let email = if results.len() != people.len() {

                if sent != 1 {
                    // Send reminder only if mail recieved but no wish sets
                    continue;
                }

                let content = format!(r#"<p>Hi,</p>
<p>This is a reminder for the event <strong>{name}</strong>.
The deadline to set your wishes is {deadline}.</p>

<pre>{message}</pre>

<p><a href="{url}/wish#{key}">Click here</a> to set your wishes.</p>

<p>Have a nice day,<br />
The Wish team</p>"#,
                                      name = name,
                                      url = url,
                                      deadline = deadline,
                                      key = key,
                                      message = data.message);

                EmailBuilder::new()
                    .to(mail)
                    .from("wish@epfl.ch")
                    .reply_to(amail)
                    .html(content.as_str())
                    .subject(format!("Wish reminder : {}", name).as_str())
                    .build()
            } else {
                let k = results[i] as usize;
                let slot = &slots[k];
                let grade =
                    match x.get_array("wish").unwrap_or(&vec![Bson::I32(0); slots.len()])[k] {
                        Bson::I32(x) => x,
                        _ => 0,
                    };

                let content = format!(r#"<p>Hi,</p>
<p>The event <strong>{name}</strong> has reached the deadline ({deadline}).</p>
<p>The results have been computed and you have been placed into the slot
<strong>{slot}</strong> (grade {grade}).</p>

<pre>{message}</pre>

<p>You can see the full results on your user page by
<a href="{url}/wish#{key}">clicking here</a>.</p>

<p>Have a nice day,<br />
The Wish team</p>"#,
                                      slot = slot,
                                      name = name,
                                      url = url,
                                      deadline = deadline,
                                      key = key,
                                      grade = grade,
                                      message = data.message);

                EmailBuilder::new()
                    .to(mail)
                    .from("wish@epfl.ch")
                    .reply_to(amail)
                    .html(content.as_str())
                    .subject(format!("Wish : {}", name).as_str())
                    .build()
            };

            let email = match email {
                Ok(x) => x,
                Err(e) => {
                    errors.push(format!("{} : {}", mail, e));
                    continue;
                }
            };

            let result = mailer.send(email);

            if let Err(e) = result {
                errors.push(format!("{} : {}", mail, e));
            }
        }
    }

    if !errors.is_empty() {
        Ok(Response::with((status::NotFound,
                           errors.join("\n"),
                           Header(AccessControlAllowOrigin::Any))))
    } else {
        Ok(Response::with((status::Ok, Header(AccessControlAllowOrigin::Any))))
    }
}
