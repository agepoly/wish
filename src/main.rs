extern crate iron;
extern crate router;

#[macro_use(bson, doc)]
extern crate bson;
extern crate mongodb;

extern crate rustc_serialize;
extern crate crypto;
extern crate rand;
extern crate time;
extern crate num_cpus;

mod solver;

use iron::prelude::*;
use iron::status;
use router::Router;
use std::sync::{Arc, Mutex};
use iron::mime::Mime;
use mongodb::{Client, ThreadedClient};
use mongodb::db::{Database, ThreadedDatabase};
use rustc_serialize::json;
use rustc_serialize::json::Json;
use bson::{Document, Bson};
use std::io::Read;
use crypto::md5::Md5;
use crypto::digest::Digest;
use rustc_serialize::hex::ToHex;
use std::collections::btree_map::BTreeMap;
use rand::Rng;


#[derive(RustcEncodable, RustcDecodable)]
struct InputCreate {
	name: String,
	deadline: i64,
	mails: Vec<String>,
	slots: Vec<String>,
	vmin: Vec<i32>,
	vmax: Vec<i32>
}

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

#[derive(RustcEncodable, RustcDecodable)]
struct InputFill {
	key: String,
	wish: Vec<i32>
}


fn main() {
	let client = Client::connect("localhost", 27017)
		.expect("Failed to initialize client.");
    
	let db: Database = client.db("activities");
	
	let mut router = Router::new();

	let arc = Arc::new(Mutex::new(db));
	{
		let arc = arc.clone();
		router.post("/create", move |r: &mut Request| 
			create(r, &arc.lock().unwrap()));
	}
	{
		let arc = arc.clone();
		router.post("/fill", move |r: &mut Request| 
			fill(r, &arc.lock().unwrap()));
	}
	{
		let arc = arc.clone();
		router.post("/info", move |r: &mut Request| 
			info(r, &arc.lock().unwrap()));
	}

	router.get("/get/:key", gui_get);
	router.get("/", gui_home);
	
	
	let handler = {
		let arc = arc.clone();		
		std::thread::spawn(move || {
			loop {
				std::thread::sleep(std::time::Duration::from_secs(10));
				process(&arc.lock().unwrap());
			}
		})
	};
	
	fn create(req: &mut Request, db: &Database) -> IronResult<Response> {		
		let mut payload = String::new();
		req.body.read_to_string(&mut payload).unwrap();
		let data: InputCreate = match json::decode(&payload) {
			Ok(x) => x,
			Err(e) => {
				println!("create: {}", e);
				return Ok(Response::with(status::BadRequest));
			}
		};

		if data.vmax.iter().fold(0, |acc, &x| acc + x) < (data.mails.len() as i32) {
			println!("create: not enough room");
			return Ok(Response::with(status::BadRequest));
		}
		
		if data.vmax.len() != data.vmin.len() || data.vmax.len() != data.slots.len() {
			println!("create: array size problem");
			return Ok(Response::with(status::BadRequest));
		}
		
		if data.vmin.iter().zip(data.vmax.iter()).any(|(&xmin, &xmax)| xmin > xmax) {
			println!("create: vmin > vmax");
			return Ok(Response::with(status::BadRequest));			
		}

		let mut hasher = Md5::new();
		let mut keys = Vec::new();
		for mail in data.mails.iter() {
			loop {
				hasher.input(mail.as_bytes());
				hasher.input(data.name.as_bytes());
				let mut bytes: [u8; 4] = [0; 4];
				rand::thread_rng().fill_bytes(&mut bytes);
				hasher.input(&bytes);
				let mut output: [u8; 16] = [0; 16];
				hasher.result(&mut output);
				hasher.reset();
				let k = output.to_hex();
				if keys.contains(&k) {
					continue;
				}
				if db.collection("events").find_one(Some(doc!{"people.key" => (k.clone())}), None).unwrap_or(None).is_some() {
					continue;
				}
				keys.push(k);
				break;
			}
		}
		
		let mut doc = Document::new();
		doc.insert_bson("name".to_owned(), Bson::String(data.name.clone()));
		doc.insert_bson("deadline".to_owned(), Bson::I64(data.deadline));
		doc.insert_bson("slots".to_owned(), Bson::Array(data.slots.iter().map(|s| Bson::String(s.clone())).collect()));
		doc.insert_bson("vmin".to_owned(), Bson::Array(data.vmin.iter().map(|v| Bson::I32(*v)).collect()));
		doc.insert_bson("vmax".to_owned(), Bson::Array(data.vmax.iter().map(|v| Bson::I32(*v)).collect()));
		doc.insert_bson("people".to_owned(), {
			let mut x = Vec::new();
			for i in 0..data.mails.len() {
				let mut p = Document::new();
				p.insert("mail", data.mails[i].clone());
				p.insert("key", keys[i].clone());
				
				p.insert("wish", {
					let mut v = Vec::new();
					v.resize(data.slots.len(), Bson::I32(0));
					v
				});
				x.push(Bson::Document(p));
			}
			Bson::Array(x)
		});
		
		if let Err(e) = db.collection("events").insert_one(doc, None) {
			println!("create: {}", e);
			return Ok(Response::with((status::Ok, r#"{"error": "database"}"#)));
		}
		
		let json = Json::Object({
			let mut bt = BTreeMap::new();
			bt.insert("people".to_owned(), Json::Array({
				let mut v = Vec::new();
				for i in 0..data.mails.len() {
					let mut obj = BTreeMap::new();
					obj.insert("mail".to_owned(), Json::String(data.mails[i].clone()));
					obj.insert("key".to_owned(), Json::String(keys[i].clone()));
					v.push(Json::Object(obj));
				}
				v
			}));
			bt
		});
		let payload = match json::encode(&json) {
			Ok(x) => x,
			Err(e) => {
				println!("create: {}", e);
				return Ok(Response::with((status::Ok, r#"{"error": "unknown"}"#)));
			}
		};
	
		Ok(Response::with((status::Ok, payload)))
	}

	fn fill(req: &mut Request, db: &Database) -> IronResult<Response> {
		let mut payload = String::new();
		req.body.read_to_string(&mut payload).unwrap();
	
		let data: InputFill = match json::decode(&payload) {
			Ok(x) => x,
			Err(e) => {
				println!("fill: {}", e);
				return Ok(Response::with((status::BadRequest, r#"{"error": "error when parse data"}"#)));
			}
		};
		
		let mut c = data.wish.clone();
		c.sort();
		for i in 0..c.len() {
			if c[i] > i as i32 {
				return Ok(Response::with((status::BadRequest, r#"{"error": "illegal data"}"#)));
			}
		}
		
		let wish = Bson::Array(data.wish.iter().map(|x| Bson::I32(*x)).collect());

		match db.collection("events").update_one(doc!{"people.key" => (data.key.clone())}, doc!{"$set" => {"people.$.wish" => wish}}, None) {
			Ok(_) => {},
			Err(e) => {
				println!("info: {}", e);
				return Ok(Response::with((status::NotFound, r#"{"error": "error with database"}"#)));
			}
		};
		
		
		Ok(Response::with(status::Ok))
	}
	
	fn info(req: &mut Request, db: &Database) -> IronResult<Response> {
		let mut payload = String::new();
		req.body.read_to_string(&mut payload).unwrap();

		let data: InputInfo = match json::decode(&payload) {
			Ok(x) => x,
			Err(e) => {
				println!("info: {}\n{}", e, payload);
				return Ok(Response::with(status::BadRequest));
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
				return Ok(Response::with((status::NotFound, r#"{"error": "database"}"#)));
			}
		};
		
		
		if let Some(event) = event {
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
			if let Some(person) = person {
				let payload = json::encode(&OutputInfo{ 
					name: event.get_str("name").unwrap_or("").to_string(),
					deadline: event.get_i64("deadline").unwrap_or(0),
					mails: event.get_array("people").unwrap_or(&Vec::new()).iter().map(|p| match p {&Bson::Document(ref x) => x.get_str("mail").unwrap_or("@").to_owned(), _ => "@".to_owned()}).collect(),
					mail: person.get_str("mail").unwrap_or("@").to_owned(),
					wish: person.get_array("wish").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::I32(v) => v, _ => 0}).collect(),
					slots: event.get_array("slots").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::String(ref v) => v.clone(), _ => "".to_owned()}).collect(),
					results: event.get_array("results").unwrap_or(&Vec::new()).iter().map(|x| match x {&Bson::I32(v) => v, _ => 0}).collect()
				}).unwrap();
				Ok(Response::with((status::Ok, payload)))
			} else {
				Ok(Response::with((status::NotFound, r#"{"error": "database"}"#)))
			}
		} else {
			Ok(Response::with((status::NotFound, r#"{"error": "database"}"#)))
		}
	}
	
	fn gui_get(_: &mut Request) -> IronResult<Response> {
		let content_type : Mime = "text/html".parse().unwrap();
		Ok(Response::with((content_type, status::Ok, include_str!("get.html"))))
	}
	fn gui_home(_: &mut Request) -> IronResult<Response> {
		let content_type : Mime = "text/html".parse().unwrap();
		Ok(Response::with((content_type, status::Ok, include_str!("home.html"))))
	}
	
	fn process(db: &Database) {
		let time = time::get_time().sec;
		
		let query = doc!{"deadline" => {"$lt" => time}, "results" => (Bson::Null)};

		if let Ok(Some(event)) = db.collection("events").find_one(Some(query), None) {
			println!("event found");
			
			let vmin = event.get_array("vmin").unwrap().iter().map(|x| match x { &Bson::I32(v) => v as u32, _ => 0 }).collect();
			let vmax = event.get_array("vmax").unwrap().iter().map(|x| match x { &Bson::I32(v) => v as u32, _ => 0 }).collect();
			let wishes = event.get_array("people").unwrap().iter().map(|p| match p { &Bson::Document(ref p) => p.get_array("wish").unwrap().iter().map(|x| match x {&Bson::I32(v) => v as u32, _ => 0}).collect(), _ => Vec::new()} ).collect();
			
			let results = solver::search_solution(&vmin, &vmax, &wishes, 10f64);
			if results.is_empty() { return; }
			
			let results = Bson::Array(results[0].iter().map(|x| Bson::I32(*x as i32)).collect());
			db.collection("events").update_one(doc!{"_id" => (event.get_object_id("_id").unwrap().clone())}, doc!{"$set" => {"results" => results}}, None).unwrap();
		}
	}

	Iron::new(router).http("localhost:3000").unwrap();
	handler.join().unwrap();
}
