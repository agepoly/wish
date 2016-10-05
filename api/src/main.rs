extern crate iron;
extern crate router;

#[macro_use(bson, doc)]
extern crate bson;
extern crate mongodb;

extern crate rustc_serialize;
extern crate rand;
extern crate time;
extern crate num_cpus;

mod solver;

use iron::prelude::*;
use iron::status;
use router::Router;
use std::sync::{Arc, Mutex};
use mongodb::{Client, ThreadedClient};
use mongodb::db::{Database, ThreadedDatabase};
use rustc_serialize::json;
use rustc_serialize::json::Json;
use bson::{Document, Bson};
use std::io::Read;
use rustc_serialize::hex::ToHex;
use std::collections::btree_map::BTreeMap;
use rand::Rng;
use std::env;
use iron::headers::AccessControlAllowOrigin;
use iron::modifiers::Header;

fn main() {
	let client = Client::connect("db", 27017)
		.ok().expect("Failed to initialize client.");

	let db: Arc<Mutex<Database>> = Arc::new(Mutex::new(client.db("activities")));

	let mut router = Router::new();

	let arc = db.clone();
	router.post("/create", move |r: &mut Request|
		create(r, &arc.lock().unwrap()), "create");

	let arc = db.clone();
	router.post("/fill", move |r: &mut Request|
		fill(r, &arc.lock().unwrap()), "fill");

	let arc = db.clone();
	router.post("/info", move |r: &mut Request|
		info(r, &arc.lock().unwrap()), "info");

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

	#[derive(RustcEncodable, RustcDecodable)]
	struct InputCreate {
		name: String,
		deadline: i64,
		mails: Vec<String>,
		slots: Vec<String>,
		vmin: Vec<i32>,
		vmax: Vec<i32>
	}

	let mut payload = String::new();
	req.body.read_to_string(&mut payload).unwrap();
	let data: InputCreate = match json::decode(&payload) {
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

	let mut keys = Vec::with_capacity(data.mails.len());
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
	doc.insert_bson("name".to_owned(), Bson::String(data.name.clone()));
	doc.insert_bson("admin_key".to_owned(), Bson::String(admin_key.clone()));
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

	Ok(Response::with((status::Ok, payload, Header(AccessControlAllowOrigin::Any))))
}

fn fill(req: &mut Request, db: &Database) -> IronResult<Response> {
	println!("fill");

	#[derive(RustcEncodable, RustcDecodable)]
	struct InputFill {
		key: String,
		wish: Vec<i32>,
		admin_key: String
	}

	let mut payload = String::new();
	req.body.read_to_string(&mut payload).unwrap();

	let data: InputFill = match json::decode(&payload) {
		Ok(x) => x,
		Err(e) => {
			println!("fill: {}", e);
			return Ok(Response::with((status::BadRequest, format!(r#"{{"error": "request error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
		}
	};

	if db.collection("events").find_one(Some(doc!{"admin_key" => (data.admin_key.clone()), "people.key" => (data.key.clone())}), None).unwrap_or(None).is_none() {
		let mut c = data.wish.clone();
		c.sort();
		for i in 0..c.len() {
			if c[i] > i as i32 {
				println!("fill: illegal data");
				return Ok(Response::with((status::BadRequest, r#"{"error": "illegal data"}"#, Header(AccessControlAllowOrigin::Any))));
			}
		}
	}

	let wish = Bson::Array(data.wish.iter().map(|x| Bson::I32(*x)).collect());

	match db.collection("events").update_one(doc!{"people.key" => (data.key.clone())}, doc!{"$set" => {"people.$.wish" => wish}}, None) {
		Ok(_) => {},
		Err(e) => {
			println!("info: {}", e);
			return Ok(Response::with((status::NotFound, format!(r#"{{"error": "database error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
		}
	};

	Ok(Response::with((status::Ok, Header(AccessControlAllowOrigin::Any))))
}

fn info(req: &mut Request, db: &Database) -> IronResult<Response> {
	println!("info");

	#[derive(RustcEncodable, RustcDecodable)]
	struct InputInfo {
		key: String,
	}

	#[derive(RustcEncodable, RustcDecodable)]
	struct OutputInfo {
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

	let data: InputInfo = match json::decode(&payload) {
		Ok(x) => x,
		Err(e) => {
			println!("info: {}\n{}", e, payload);
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
			println!("info: {}", e);
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
					let json = json::encode(&OutputInfo {
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
							println!("info: {}", e);
							return Ok(Response::with((status::NotFound, format!(r#"{{"error": "json error : {}"}}"#, e), Header(AccessControlAllowOrigin::Any))));
						}
					};
					Ok(Response::with((status::Ok, payload, Header(AccessControlAllowOrigin::Any))))
				}
			}
		}
	}
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
