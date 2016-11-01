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

use iron::prelude::*;
use iron::status;
use router::Router;
use std::sync::{Arc, Mutex};
use mongodb::{Client, ThreadedClient};
use mongodb::db::{Database, ThreadedDatabase};
use rustc_serialize::json;
use bson::{Document, Bson};
use std::io::Read;
use rustc_serialize::hex::ToHex;
use rand::Rng;
use std::env;
use iron::headers::AccessControlAllowOrigin;
use iron::modifiers::Header;

use lettre::email::EmailBuilder;
use lettre::transport::smtp::SmtpTransportBuilder;
use lettre::transport::EmailTransport;


fn main() {
	let client = Client::connect("db", 27017)
		.expect("Failed to initialize mongodb client.");
	client.db("wish").collection("events").find(None, None).expect("Failed to connect to mongodb");

	let db: Arc<Mutex<Database>> = Arc::new(Mutex::new(client.db("wish")));

	let mut router = Router::new();

	let arc = db.clone();
	router.post("/create", move |r: &mut Request|
		create(r, &arc.lock().unwrap()), "create");

	let arc = db.clone();
	router.post("/set_wish", move |r: &mut Request|
		set_wish(r, &arc.lock().unwrap()), "set_wish");

	let arc = db.clone();
	router.post("/get_data", move |r: &mut Request|
		get_data(r, &arc.lock().unwrap()), "get_data");

	let arc = db.clone();
	router.post("/get_admin_data", move |r: &mut Request|
		get_admin_data(r, &arc.lock().unwrap()), "get_admin_data");

	let arc = db.clone();
	router.post("/admin_update", move |r: &mut Request|
		admin_update(r, &arc.lock().unwrap()), "admin_update");

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

fn create_mailer(reuse : bool) -> Result<lettre::transport::smtp::SmtpTransport, lettre::transport::smtp::error::Error> {
	match SmtpTransportBuilder::new((config::MAIL_SERVER, config::MAIL_PORT)) {
		Ok(x) => {
			let mailer = if config::MAIL_USER.len() > 0 && config::MAIL_PASSWORD.len() > 0 {
				x.credentials(config::MAIL_USER, config::MAIL_PASSWORD)
					.ssl_wrapper()
			} else {
				x
			};
			Ok(if reuse {
				mailer.connection_reuse(true)
			} else {
				mailer
			}.build())
		}
		Err(e) => {
			Err(e)
		}
	}
}

fn create(req: &mut Request, db: &Database) -> IronResult<Response> {
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
		message: String
	}

	let mut payload = String::new();
	if let Err(e) = req.body.read_to_string(&mut payload) {
		println!("create: {}", e);
		return Ok(Response::with((status::NotFound, format!("request error : {}", e), Header(AccessControlAllowOrigin::Any))));
	}
	let data: Input = match json::decode(&payload) {
		Ok(x) => x,
		Err(e) => {
			println!("create: {}", e);
			return Ok(Response::with((status::NotFound, format!("request error : {}", e), Header(AccessControlAllowOrigin::Any))));
		}
	};

	if data.vmin.len() != data.vmax.len() || data.vmin.len() != data.slots.len() {
		return Ok(Response::with((status::NotFound, "vmin, vmax, slots, length problem", Header(AccessControlAllowOrigin::Any))));
	}

	if data.vmax.iter().fold(0, |acc, &x| acc + x) < (data.mails.len() as i32) {
		return Ok(Response::with((status::NotFound, "not enough room for people", Header(AccessControlAllowOrigin::Any))));
	}

	if data.vmin.iter().fold(0, |acc, &x| acc + x) > (data.mails.len() as i32) {
		return Ok(Response::with((status::NotFound, "not enough people", Header(AccessControlAllowOrigin::Any))));
	}

	if data.vmax.len() != data.vmin.len() || data.vmax.len() != data.slots.len() {
		println!("create: array size problem");
		return Ok(Response::with((status::NotFound, "vmin, vmax and slots must have the same size", Header(AccessControlAllowOrigin::Any))));
	}

	if data.vmin.iter().zip(data.vmax.iter()).any(|(&xmin, &xmax)| xmin > xmax) {
		println!("create: vmin > vmax");
		return Ok(Response::with((status::NotFound, "there are vmin bigger than vmax", Header(AccessControlAllowOrigin::Any))));
	}

	let mut keys : Vec<String> = Vec::with_capacity(data.mails.len());
	for _ in 0..data.mails.len() {
		loop {
			let mut key: [u8; 16] = [0; 16];
			rand::thread_rng().fill_bytes(&mut key);
			let key = key.to_hex();
			if keys.contains(&key) {
				continue;
			}
			if db.collection("events").find_one(Some(doc!{"people.key" => (key.clone())}), None).unwrap_or(None).is_some() {
				continue;
			}
			keys.push(key);
			break;
		}
	}

	let admin_key = {
		let mut admin_key : String;
		loop {
			let mut key : [u8; 16] = [0; 16];
			rand::thread_rng().fill_bytes(&mut key);
			admin_key = key.to_hex();
			if db.collection("events").find_one(Some(doc!{"admin_key" => (admin_key.clone())}), None).unwrap_or(None).is_none() {
				break;
			}
		}
		admin_key
	};

	let mut mailer = match create_mailer(false) {
		Ok(x) => {
			x
		}
		Err(e) => {
			println!("create: {}", e);
			return Ok(Response::with((status::NotFound, format!("mail error : {}", e), Header(AccessControlAllowOrigin::Any))))
		}
	};

	let email = EmailBuilder::new()
					.from("wish@epfl.ch")
					.to(data.amail.as_str())
					.html(format!(
	r#"<p>An event has been created with your email address.<br />
	If you are not concerned, please do not click on the following url.<br />
	<a href="http://{url}/admin#{key}">Click here</a> to activate and administrate the activity.</p>
	
	<p>Have a good day,<br />
	The Wish team</p>"#,
						url = data.url.as_str(), 
						key = admin_key.as_str()
					).as_str())
					.subject(format!("Wish : {}", data.name).as_str())
					.build();
	let email = match email {
		Ok(x) => x,
		Err(e) => {
			println!("create: {}", e);
			return Ok(Response::with((status::NotFound, format!("mail error : {}", e), Header(AccessControlAllowOrigin::Any))))
		}
	};

	if let Err(e) = mailer.send(email) {
		println!("create: {}", e);
		return Ok(Response::with((status::NotFound, format!("mail error : {}", e), Header(AccessControlAllowOrigin::Any))));
	}
	
	
	let mut doc = Document::new();
	doc.insert_bson("message".to_string(), Bson::String(data.message.clone()));
	doc.insert_bson("url".to_owned(), Bson::String(data.url.clone()));
	doc.insert_bson("name".to_owned(), Bson::String(data.name.clone()));
	doc.insert_bson("admin_key".to_owned(), Bson::String(admin_key.clone()));
	doc.insert_bson("amail".to_owned(), Bson::String(data.amail.clone()));
	doc.insert_bson("deadline".to_owned(), Bson::I64(data.deadline));
	doc.insert_bson("slots".to_owned(), Bson::Array(data.slots.iter().map(|s| Bson::String(s.clone())).collect()));
	doc.insert_bson("vmin".to_owned(), Bson::Array(data.vmin.iter().map(|&v| Bson::I32(v)).collect()));
	doc.insert_bson("vmax".to_owned(), Bson::Array(data.vmax.iter().map(|&v| Bson::I32(v)).collect()));
	doc.insert_bson("people".to_owned(), {
		let mut x : Vec<Bson> = Vec::with_capacity(data.mails.len());
		for i in 0..data.mails.len() {
			let mut p = Document::new();
			p.insert_bson("mail".to_owned(), Bson::String(data.mails[i].clone()));
			p.insert_bson("key".to_owned(), Bson::String(keys[i].clone()));
			p.insert_bson("sent".to_owned(), Bson::Boolean(false));

			p.insert_bson("wish".to_owned(), {
				let mut v = Vec::new();
				v.resize(data.slots.len(), Bson::I32(0));
				Bson::Array(v)
			});
			x.push(Bson::Document(p));
		}
		Bson::Array(x)
	});

	if let Err(e) = db.collection("events").insert_one(doc, None) {
		println!("create: {}", e);
		return Ok(Response::with((status::NotFound, format!("database error : {}", e), Header(AccessControlAllowOrigin::Any))));
	}

	Ok(Response::with((status::Ok, Header(AccessControlAllowOrigin::Any))))
}

fn set_wish(req: &mut Request, db: &Database) -> IronResult<Response> {
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
			return Ok(Response::with((status::BadRequest, format!("request error : {}", e), Header(AccessControlAllowOrigin::Any))));
		}
	};
	
	match db.collection("events").find_one(Some(doc!{"people.key" => (data.key.clone())}), None) {
		Ok(Some(event)) => {
			match event.get_array("slots") {
				Ok(slots) => {
					if slots.len() != data.wish.len() {
						println!("set_wishes: wish length does not match with slots length");
						return Ok(Response::with((status::NotFound, format!("wish length does not match with slots length"), Header(AccessControlAllowOrigin::Any))));
					}
				}
				Err(e) => {
					println!("set_wishes: {}", e);
					return Ok(Response::with((status::NotFound, format!("database error : {}", e), Header(AccessControlAllowOrigin::Any))));
				}
			}
		}
		Ok(None) => {
			println!("set_wishes: Wrong user key");
			return Ok(Response::with((status::NotFound, format!("wrong user key"), Header(AccessControlAllowOrigin::Any))));
		}
		Err(e) => {
			println!("set_wishes: {}", e);
			return Ok(Response::with((status::NotFound, format!("database error : {}", e), Header(AccessControlAllowOrigin::Any))));
		}
	};

	if db.collection("events").find_one(Some(doc!{"admin_key" => (data.admin_key.clone()), "people.key" => (data.key.clone())}), None).unwrap_or(None).is_none() {
		let mut c = data.wish.clone();
		c.sort();
		for i in 0..c.len() {
			if c[i] > i as i32 {
				println!("set_wishes: unfair wish");
				return Ok(Response::with((status::BadRequest, "unfair wish", Header(AccessControlAllowOrigin::Any))));
			}
		}
	}

	let wish = Bson::Array(data.wish.iter().map(|x| Bson::I32(*x)).collect());

	match db.collection("events").update_one(doc!{"people.key" => (data.key.clone())}, doc!{"$set" => {"people.$.wish" => wish}}, None) {
		Ok(_) => {},
		Err(e) => {
			println!("set_wishes: {}", e);
			return Ok(Response::with((status::NotFound, format!("database error : {}", e), Header(AccessControlAllowOrigin::Any))));
		}
	};

	Ok(Response::with((status::Ok, Header(AccessControlAllowOrigin::Any))))
}

fn get_data(req: &mut Request, db: &Database) -> IronResult<Response> {
	println!("get_data");

	#[derive(RustcDecodable)]
	struct Input {
		key: String,
	}

	#[derive(RustcEncodable)]
	struct Output {
		name: String,
		mail: String,
		mails: Vec<String>,
		slots: Vec<String>,
		wish: Vec<i32>,
		deadline: i64,
		results: Vec<i32>
	}

	let mut payload = String::new();
	req.body.read_to_string(&mut payload).unwrap();

	let data: Input = match json::decode(&payload) {
		Ok(x) => x,
		Err(e) => {
			println!("get_data: {}\n{}", e, payload);
			return Ok(Response::with((status::BadRequest, Header(AccessControlAllowOrigin::Any))));
		}
	};

	//let query = doc!{"people" => {"$elemMatch" => {"key" => (data.key.clone())}}};
	let query = doc!{"people.key" => (data.key.clone())};
	let mut options = mongodb::coll::options::FindOptions::new();
	options.projection = Some(doc!{"_id" => false});

	let event = match db.collection("events").find_one(Some(query), Some(options)) {
		Ok(Some(x)) => x,
		Ok(None) => {
			println!("get_data: invalid key");
			return Ok(Response::with((status::NotFound, "invalid key", Header(AccessControlAllowOrigin::Any))));			
		}
		Err(e) => {
			println!("get_data: {}", e);
			return Ok(Response::with((status::NotFound, format!("database error : {}", e), Header(AccessControlAllowOrigin::Any))));
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
		None => Ok(Response::with((status::NotFound, "strange error person in None", Header(AccessControlAllowOrigin::Any)))),
		Some(person) => {
			let json = json::encode(&Output {
				name: event.get_str("name").unwrap_or("").to_string(),
				deadline: event.get_i64("deadline").unwrap_or(0),
				mails: event.get_array("people").unwrap_or(&Vec::new()).iter().map(|p| match p {&Bson::Document(ref x) => x.get_str("mail").unwrap_or("@").to_owned(), _ => "@".to_owned()}).collect(),
				mail: person.get_str("mail").unwrap_or("@").to_owned(),
				wish: person.get_array("wish").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::I32(v) => v, _ => 0}).collect(),
				slots: event.get_array("slots").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::String(ref v) => v.clone(), _ => "".to_owned()}).collect(),
				results: event.get_array("results").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::I32(v) => v, _ => 0}).collect()
			});
			let payload = match json {
				Ok(x) => x,
				Err(e) => {
					println!("get_data: {}", e);
					return Ok(Response::with((status::NotFound, format!("json error : {}", e), Header(AccessControlAllowOrigin::Any))));
				}
			};
			Ok(Response::with((status::Ok, payload, Header(AccessControlAllowOrigin::Any))))
		}
	}
}

fn get_admin_data(req: &mut Request, db: &Database) -> IronResult<Response> {
	println!("get_admin_data");

	#[derive(RustcDecodable)]
	struct Input {
		key: String,
	}

	#[derive(RustcEncodable)]
	struct Output {
		name: String,
		mails: Vec<String>,
		sent: Vec<bool>,
		keys: Vec<String>,
		slots: Vec<String>,
		vmin: Vec<i32>,
		vmax: Vec<i32>,
		wishes: Vec<Vec<i32>>,
		deadline: i64,
	}

	let mut payload = String::new();
	req.body.read_to_string(&mut payload).unwrap();

	let data: Input = match json::decode(&payload) {
		Ok(x) => x,
		Err(e) => {
			println!("get_admin_data: {}\n{}", e, payload);
			return Ok(Response::with((status::BadRequest, "input data parsing", Header(AccessControlAllowOrigin::Any))));
		}
	};

	let mut options = mongodb::coll::options::FindOptions::new();
	options.projection = Some(doc!{"_id" => false});

	let event = match db.collection("events").find_one(Some(doc!{"admin_key" => (data.key.clone())}), Some(options)) {
		Ok(Some(x)) => x,
		Ok(None) => {
			println!("get_admin_data: invalid key");
			return Ok(Response::with((status::NotFound, "invalid key", Header(AccessControlAllowOrigin::Any))));			
		}
		Err(e) => {
			println!("get_admin_data: {}", e);
			return Ok(Response::with((status::NotFound, format!("database error : {}", e), Header(AccessControlAllowOrigin::Any))))
		}
	};

	let url = event.get_str("url").unwrap_or("wish.com");
	let name = event.get_str("name").unwrap_or("no name");
	let amail = event.get_str("amail").unwrap_or("");
	let message = event.get_str("message").unwrap_or("");

	let mut mailer = match create_mailer(true) {
		Ok(x) => {
			x
		}
		Err(e) => {
			println!("get_admin_data: {}", e);
			return Ok(Response::with((status::NotFound, format!("mail error : {}", e), Header(AccessControlAllowOrigin::Any))))
		}
	};

	
	let mut people = event.get_array("people").unwrap_or(&Vec::new()).clone();

	for p in people.iter_mut() {
		if let &mut Bson::Document(ref mut x) = p {
			if !x.get_bool("sent").unwrap_or(false) {
				match EmailBuilder::new()
						.to(x.get_str("mail").unwrap_or(""))
						.from("wish@epfl.ch")
						.reply_to(amail)
						.html(format!(
	r#"<p>You has been invited by {amail} to give your wishes about the event : <strong>{name}</strong></p>
	<pre>
{message}
	</pre>
	
	<p><a href="http://{url}/wish#{key}">Click here</a> to set your wishes.</p>

	<p>Have a good day,<br />
	The Wish team</p>"#,
							amail = amail, 
							name = name, 
							message = message, 
							url = url, 
							key = x.get_str("key").unwrap_or("")
						).as_str())
						.subject(format!("Wish : {}", name).as_str())
						.build() {
					Ok(email) => x.insert("sent", mailer.send(email).is_ok()),	
					Err(e) => return Ok(Response::with((status::NotFound, format!("mail : {}", e), Header(AccessControlAllowOrigin::Any))))
				};
			}
		}
	}

	// Explicitly close the SMTP transaction as we enabled connection reuse
	mailer.close();
	
	let mut document = Document::new();
	document.insert("people", Bson::Array(people.clone()));
	
	if let Err(e) = db.collection("events").update_one(doc!{"admin_key" => (data.key.clone())}, doc!{"$set" => document}, None) {
		println!("get_admin_data: {}", e);
		return Ok(Response::with((status::NotFound, format!("database error : {}", e), Header(AccessControlAllowOrigin::Any))));
	}

	let json = json::encode(&Output {
		name: event.get_str("name").unwrap_or("").to_string(),
		deadline: event.get_i64("deadline").unwrap_or(0),
		mails: event.get_array("people").unwrap_or(&Vec::new()).iter().map(|p|
			match p {
				&Bson::Document(ref x) => x.get_str("mail").unwrap_or("").to_owned(),
				_ => "".to_owned()
			}
		).collect(),
		sent: people.iter().map(|p|
			match p {
				&Bson::Document(ref x) => x.get_bool("sent").unwrap_or(false),
				_ => false
			}
		).collect(),
		keys: event.get_array("people").unwrap_or(&Vec::new()).iter().map(|p|
			match p {
				&Bson::Document(ref x) => x.get_str("key").unwrap_or("").to_owned(),
				_ => "".to_owned()
			}
		).collect(),
		wishes: event.get_array("people").unwrap_or(&Vec::new()).iter().map(|p|
			match p {
				&Bson::Document(ref x) => x.get_array("wish").unwrap_or(&Vec::new()).iter().map(|x|
					match x {
						&Bson::I32(v) => v,
						_ => 0
					}
				).collect(),
				_ => Vec::new()
			}
		).collect(),
		slots: event.get_array("slots").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::String(ref v) => v.clone(), _ => "".to_owned()}).collect(),
		vmin: event.get_array("vmin").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::I32(ref v) => v.clone(), _ => 0}).collect(),
		vmax: event.get_array("vmax").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::I32(ref v) => v.clone(), _ => 0}).collect(),
	});
	let payload = match json {
		Ok(x) => x,
		Err(e) => {
			println!("get_admin_data: {}", e);
			return Ok(Response::with((status::NotFound, format!("json error : {}", e), Header(AccessControlAllowOrigin::Any))));
		}
	};
	Ok(Response::with((status::Ok, payload, Header(AccessControlAllowOrigin::Any))))
}


fn admin_update(req: &mut Request, db: &Database) -> IronResult<Response> {
	println!("admin_update");

	#[derive(RustcDecodable)]
	struct Input {
		key: String,
		deadline: i64,
		slots: Vec<String>,
		vmin: Vec<i32>,
		vmax: Vec<i32>
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

	let event = match db.collection("events").find_one(Some(doc!{"admin_key" => (data.key.clone())}), None) {
		Ok(Some(x)) => x,
		Ok(None) => {
			println!("admin_update: invalid key");
			return Ok(Response::with((status::BadRequest, "invalid key", Header(AccessControlAllowOrigin::Any))))			
		}
		Err(e) => {
			println!("admin_update: {}", e);
			return Ok(Response::with((status::BadRequest, format!("database {}", e), Header(AccessControlAllowOrigin::Any))))
		}
	};
	
	if data.vmin.len() != data.vmax.len() || data.vmin.len() != data.slots.len() {
		return Ok(Response::with((status::NotFound, "vmin, vmax, slots, length problem", Header(AccessControlAllowOrigin::Any))));
	}

	if data.vmax.iter().fold(0, |acc, &x| acc + x) < (event.get_array("people").unwrap_or(&Vec::new()).len() as i32) {
		return Ok(Response::with((status::NotFound, "not enough room for people", Header(AccessControlAllowOrigin::Any))));
	}

	if data.vmin.iter().fold(0, |acc, &x| acc + x) > (event.get_array("people").unwrap_or(&Vec::new()).len() as i32) {
		return Ok(Response::with((status::NotFound, "not enough people", Header(AccessControlAllowOrigin::Any))));
	}


	if data.vmax.len() != data.vmin.len() || data.vmax.len() != data.slots.len() {
		println!("admin_update: array size problem");
		return Ok(Response::with((status::BadRequest, "vmin, vmax and slots must have the same size", Header(AccessControlAllowOrigin::Any))));
	}

	if data.vmin.iter().zip(data.vmax.iter()).any(|(&xmin, &xmax)| xmin > xmax) {
		println!("admin_update: vmin > vmax");
		return Ok(Response::with((status::BadRequest, "there are vmin bigger than vmax", Header(AccessControlAllowOrigin::Any))));
	}

	let mut document = Document::new();
	document.insert("deadline", Bson::I64(data.deadline));
	document.insert("slots", Bson::Array(data.slots.iter().map(|s| Bson::String(s.clone())).collect()));
	document.insert("vmin", Bson::Array(data.vmin.iter().map(|&x| Bson::I32(x)).collect()));
	document.insert("vmax", Bson::Array(data.vmax.iter().map(|&x| Bson::I32(x)).collect()));
	document.insert("results", Bson::Null);

	return match db.collection("events").update_one(doc!{"admin_key" => (data.key.clone())}, doc!{"$set" => document}, None) {
		Ok(_) => Ok(Response::with((status::Ok, Header(AccessControlAllowOrigin::Any)))),
		Err(e) => {
			println!("admin_update: {}", e);
			Ok(Response::with((status::NotFound, format!("database error : {}", e), Header(AccessControlAllowOrigin::Any))))
		}
	};
}

fn process(db: &Arc<Mutex<Database>>) {
	let time = time::get_time().sec;

	let query = doc!{"deadline" => {"$lt" => time}, "results" => (Bson::Null)};

	let event = {
		let db = db.clone();
		let db = match db.lock() {
			Ok(x) => x,
			Err(_) => return
		};
		db.collection("events").find_one(Some(query), None)
	};

	println!("check {:?}", event);

	if let Ok(Some(event)) = event {
		let vmin : Vec<u32> = event.get_array("vmin").unwrap_or(&Vec::new()).iter().map(|x| match x { &Bson::I32(v) => v as u32, _ => 0 }).collect();
		let vmax : Vec<u32> = event.get_array("vmax").unwrap_or(&Vec::new()).iter().map(|x| match x { &Bson::I32(v) => v as u32, _ => 0 }).collect();
		if vmin.len() != vmax.len() {
			println!("process: vmin vmax not same length");
			return;
		}
		let mut wishes : Vec<Vec<u32>> = event.get_array("people").unwrap_or(&Vec::new()).iter().map(|p| {
			match p {
				&Bson::Document(ref p) => p.get_array("wish").unwrap_or(&Vec::new()).iter().map(|x| {
					match x {
						&Bson::I32(v) => v as u32, 
						_ => 0
					}
				}).collect(), 
				_ => Vec::new()
			}
		}).collect();
		for wish in wishes.iter_mut() {
			wish.resize(vmin.len(), 0);
		}
		
		let vmin_total : u32 = vmin.iter().sum();
		let vmax_total : u32 = vmax.iter().sum();
		let user_total = wishes.len() as u32;
		
		if user_total > vmax_total || user_total < vmin_total {
			return;
		}

		let results = solver::search_solution(&vmin, &vmax, &wishes, 20f64);
		if results.is_empty() { return; }

		let results = Bson::Array(results[0].iter().map(|&x| Bson::I32(x as i32)).collect());
		if let Ok(db) = db.lock() {
			db.collection("events").update_one(doc!{"_id" => (event.get_object_id("_id").unwrap().clone())}, doc!{"$set" => {"results" => results}}, None).unwrap();
			
			let amail = event.get_str("amail").unwrap_or("@");
			let url = event.get_str("url").unwrap_or("www");
			let admin_key = event.get_str("admin_key").unwrap_or("");
			let name = event.get_str("name").unwrap_or("no name");
			
			let mut mailer = match create_mailer(false) {
				Ok(x) => {
					x
				}
				Err(e) => {
					println!("process: mailer {}", e);
					return;
				}
			};


			let email = EmailBuilder::new()
							.from("wish@epfl.ch")
							.to(amail)
							.html(format!(
	r#"<p>The event {name} has reach the deadline.<br />
	The results had been computed.<br />
	They are accessible on any user page.<br />
	On the admin page, any modification will reset the results and new ones will be computed.</p>
	
	<p><a href="http://{url}/admin#{key}">Click here</a> to administrate the event.</p>
	
	<p>Have a good day,<br />
	The Wish team</p>"#,
								url = url,
								key = admin_key,
								name = name
							).as_str())
							.subject(format!("Wish : {}", name).as_str())
							.build();
			match email {
				Ok(x) => {
					if let Err(e) = mailer.send(x) {
						println!("process: email send {}", e);
					}
				},
				Err(e) => {
					println!("process: email build {}", e);
					return;
				}
			};

		}
	}
}
