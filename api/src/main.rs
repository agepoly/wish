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

use iron::prelude::*;
use iron::status;
use router::Router;
use std::sync::{Arc, Mutex};
use mongodb::{Client, ThreadedClient};
use mongodb::db::{Database, ThreadedDatabase};
use rustc_serialize::json;
//use rustc_serialize::json::Json;
use bson::{Document, Bson};
use std::io::Read;
use rustc_serialize::hex::ToHex;
//use std::collections::btree_map::BTreeMap;
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
			std::thread::sleep(std::time::Duration::from_secs(15));
		}
	});

	Iron::new(router).http(env::args().nth(1).unwrap_or("api:3000".to_string()).as_str()).unwrap();
	handler.join().unwrap();
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
		url: String
	}

	let mut payload = String::new();
	req.body.read_to_string(&mut payload).unwrap();
	let data: Input = match json::decode(&payload) {
		Ok(x) => x,
		Err(e) => {
			println!("create: {}", e);
			return Ok(Response::with((status::BadRequest, format!(r#"{{"error": "request error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
		}
	};

	if data.vmax.iter().fold(0, |acc, &x| acc + x) < (data.mails.len() as i32) {
		println!("create: not enough room");
		return Ok(Response::with((status::BadRequest, r#"{"error": "more mails than slots"}"#, Header(AccessControlAllowOrigin::Any))));
	}

	if data.vmax.len() != data.vmin.len() || data.vmax.len() != data.slots.len() {
		println!("create: array size problem");
		return Ok(Response::with((status::BadRequest, r#"{"error": "vmin, vmax and slots must have the same size"}"#, Header(AccessControlAllowOrigin::Any))));
	}

	if data.vmin.iter().zip(data.vmax.iter()).any(|(&xmin, &xmax)| xmin > xmax) {
		println!("create: vmin > vmax");
		return Ok(Response::with((status::BadRequest, r#"{"error": "there are vmin bigger than vmax"}"#, Header(AccessControlAllowOrigin::Any))));
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

	let mut doc = Document::new();
	doc.insert_bson("send".to_owned(), Bson::Boolean(false));
	doc.insert_bson("url".to_owned(), Bson::String(data.url.clone()));
	doc.insert_bson("name".to_owned(), Bson::String(data.name.clone()));
	doc.insert_bson("admin_key".to_owned(), Bson::String(admin_key.clone()));
	doc.insert_bson("amail".to_owned(), Bson::String(data.amail.clone()));
	doc.insert_bson("deadline".to_owned(), Bson::I64(data.deadline));
	doc.insert_bson("slots".to_owned(), Bson::Array(data.slots.iter().map(|s| Bson::String(s.clone())).collect()));
	doc.insert_bson("vmin".to_owned(), Bson::Array(data.vmin.iter().map(|&v| Bson::I32(v)).collect()));
	doc.insert_bson("vmax".to_owned(), Bson::Array(data.vmax.iter().map(|&v| Bson::I32(v)).collect()));
	doc.insert_bson("people".to_owned(), {
		let mut x = Vec::with_capacity(data.mails.len());
		for i in 0..data.mails.len() {
			let mut p = Document::new();
			p.insert_bson("mail".to_owned(), Bson::String(data.mails[i].clone()));
			p.insert_bson("key".to_owned(), Bson::String(keys[i].clone()));

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
		return Ok(Response::with((status::NotFound, format!(r#"{{"error": "database error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
	}

	let mut mailer = SmtpTransportBuilder::new(("smtp1.epfl.ch", 25)).unwrap().connection_reuse(true).build();

	let email = EmailBuilder::new()
					.from("wish@epfl.ch")
                    .to(data.amail.as_str())
                    .body(format!("{}/admin#{}", data.url.as_str(), admin_key.as_str()).as_str())
                    .subject(format!("Wish : {}", data.name).as_str())
                    .build()
                    .unwrap();

	let result = mailer.send(email);

	// Explicitly close the SMTP transaction as we enabled connection reuse
	mailer.close();

	if let Err(ref e) = result {
		println!("create: {}", e);
		return Ok(Response::with((status::NotFound, format!(r#"{{"error": "mail error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
	}

	/*
	let json = Json::Object({
		let mut bt = BTreeMap::new();
		bt.insert("people".to_owned(), Json::Array({
			let mut v = Vec::with_capacity(data.mails.len());
			for i in 0..data.mails.len() {
				let mut obj = BTreeMap::new();
				obj.insert("mail".to_owned(), Json::String(data.mails[i].clone()));
				obj.insert("key".to_owned(), Json::String(keys[i].clone()));
				v.push(Json::Object(obj));
			}
			v
		}));
		bt.insert("admin_key".to_string(), Json::String(admin_key.clone()));
		bt
	});
	let payload = match json::encode(&json) {
		Ok(x) => x,
		Err(e) => {
			println!("create: {}", e);
			return Ok(Response::with((status::NotFound, format!(r#"{{"error": "json error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
		}
	};
	*/
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
			return Ok(Response::with((status::BadRequest, format!(r#"{{"error": "request error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
		}
	};

	if db.collection("events").find_one(Some(doc!{"admin_key" => (data.admin_key.clone()), "people.key" => (data.key.clone())}), None).unwrap_or(None).is_none() {
		let mut c = data.wish.clone();
		c.sort();
		for i in 0..c.len() {
			if c[i] > i as i32 {
				println!("set_wishes: illegal data");
				return Ok(Response::with((status::BadRequest, r#"{"error": "illegal data"}"#, Header(AccessControlAllowOrigin::Any))));
			}
		}
	}

	let wish = Bson::Array(data.wish.iter().map(|x| Bson::I32(*x)).collect());

	match db.collection("events").update_one(doc!{"people.key" => (data.key.clone())}, doc!{"$set" => {"people.$.wish" => wish}}, None) {
		Ok(_) => {},
		Err(e) => {
			println!("set_wishes: {}", e);
			return Ok(Response::with((status::NotFound, format!(r#"{{"error": "database error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
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
		Ok(x) => x,
		Err(e) => {
			println!("get_data: {}", e);
			return Ok(Response::with((status::NotFound, format!(r#"{{"error": "database error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
		}
	};

	match event {
		None => Ok(Response::with((status::NotFound, r#"{"error": "database"}"#, Header(AccessControlAllowOrigin::Any)))),
		Some(event) => {
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
				None => Ok(Response::with((status::NotFound, r#"{"error": "database"}"#, Header(AccessControlAllowOrigin::Any)))),
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
							return Ok(Response::with((status::NotFound, format!(r#"{{"error": "json error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
						}
					};
					Ok(Response::with((status::Ok, payload, Header(AccessControlAllowOrigin::Any))))
				}
			}
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
			return Ok(Response::with((status::BadRequest, Header(AccessControlAllowOrigin::Any))));
		}
	};

	let query = doc!{"admin_key" => (data.key.clone())};
	let mut options = mongodb::coll::options::FindOptions::new();
	options.projection = Some(doc!{"_id" => false});

	let event = match db.collection("events").find_one(Some(query), Some(options)) {
		Ok(x) => x,
		Err(e) => {
			println!("get_admin_data: {}", e);
			return Ok(Response::with((status::NotFound, format!(r#"{{"error": "database error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
		}
	};

	match event {
		None => Ok(Response::with((status::NotFound, r#"{"error": "database"}"#, Header(AccessControlAllowOrigin::Any)))),
		Some(event) => {
			if event.get_bool("send").unwrap_or(false) == false {
				let url = event.get_str("url").unwrap_or("wish.com");
				let name = event.get_str("name").unwrap_or("no name");

				let mut mailer = SmtpTransportBuilder::new(("smtp1.epfl.ch", 25)).unwrap().connection_reuse(true).build();

				for p in event.get_array("people").unwrap_or(&Vec::new()).iter() {
					let address = match p {
						&Bson::Document(ref x) => x.get_str("mail").unwrap_or("").to_owned(),
						_ => "".to_owned()
					};
					let key = match p {
						&Bson::Document(ref x) => x.get_str("key").unwrap_or("").to_owned(),
						_ => "".to_owned()
					};

					let email = EmailBuilder::new()
						.to(address.as_str())
						.from("wish@epfl.ch")
						.body(format!("{}/get#{}", url, key.as_str()).as_str())
						.subject(format!("Wish : {}", name).as_str())
						.build()
						.unwrap();

					mailer.send(email).unwrap();
				}

				// Explicitly close the SMTP transaction as we enabled connection reuse
				mailer.close();

				if let Err(e) = db.collection("events").update_one(doc!{"admin_key" => (data.key.clone())}, doc!{"$set" => {"send" => true}}, None) {
					println!("get_admin_data: {}", e);
					return Ok(Response::with((status::NotFound, format!(r#"{{"error": "database error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
				}
			}

			let json = json::encode(&Output {
				name: event.get_str("name").unwrap_or("").to_string(),
				deadline: event.get_i64("deadline").unwrap_or(0),
				mails:  event.get_array("people").unwrap_or(&Vec::new()).iter().map(|p|
					match p {
						&Bson::Document(ref x) => x.get_str("mail").unwrap_or("").to_owned(),
						_ => "".to_owned()
					}
				).collect(),
				keys:  event.get_array("people").unwrap_or(&Vec::new()).iter().map(|p|
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
					return Ok(Response::with((status::NotFound, format!(r#"{{"error": "json error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
				}
			};
			Ok(Response::with((status::Ok, payload, Header(AccessControlAllowOrigin::Any))))
		}
	}
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

	let mut document = Document::new();
	document.insert("deadline", Bson::I64(data.deadline));
	document.insert("slots", Bson::Array(data.slots.iter().map(|s| Bson::String(s.clone())).collect()));
	document.insert("vmin", Bson::Array(data.vmin.iter().map(|&x| Bson::I32(x)).collect()));
	document.insert("vmax", Bson::Array(data.vmax.iter().map(|&x| Bson::I32(x)).collect()));

	return match db.collection("events").update_one(doc!{"admin_key" => (data.key.clone())}, doc!{"$set" => document}, None) {
		Ok(_) => Ok(Response::with((status::Ok, Header(AccessControlAllowOrigin::Any)))),
		Err(e) => {
			println!("admin_update: {}", e);
			Ok(Response::with((status::NotFound, format!(r#"{{"error": "database error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))))
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
		let vmin = event.get_array("vmin").unwrap_or(&Vec::new()).iter().map(|x| match x { &Bson::I32(v) => v as u32, _ => 0 }).collect();
		let vmax = event.get_array("vmax").unwrap_or(&Vec::new()).iter().map(|x| match x { &Bson::I32(v) => v as u32, _ => 0 }).collect();
		let wishes = event.get_array("people").unwrap_or(&Vec::new()).iter().map(|p| match p { &Bson::Document(ref p) => p.get_array("wish").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::I32(v) => v as u32, _ => 0}).collect(), _ => Vec::new()} ).collect();

		let results = solver::search_solution(&vmin, &vmax, &wishes, 20f64);
		if results.is_empty() { return; }

		let results = Bson::Array(results[0].iter().map(|&x| Bson::I32(x as i32)).collect());
		match db.lock() {
			Ok(x) => x,
			Err(_) => return
		}.collection("events").update_one(doc!{"_id" => (event.get_object_id("_id").unwrap().clone())}, doc!{"$set" => {"results" => results}}, None).unwrap();
	}
}
