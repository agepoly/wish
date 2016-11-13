use std::io::prelude::*;
use rand;
use time;
use std;
use rand::Rng;

// Return the position of the minimal value of a vector (the vector must be nonempty)
fn min_pos<T: PartialOrd + Copy>(xs: &Vec<T>) -> usize {
	let mut k = 0;
	let mut min = xs[0];
	for i in 1..xs.len() {
		if xs[i] < min {
			min = xs[i];
			k = i;
		}
	}
	k
}

// Compute the overage or lack in each workshop if we put the people into their best wishes
fn count(vmin: &Vec<u32>, vmax: &Vec<u32>, wishes: &Vec<Vec<f64>>) -> (Vec<i32>, bool) {
	let mut x = vec![0; vmin.len()];

	for i in 0..wishes.len() {
		x[min_pos(&wishes[i])] += 1;
	}

	let mut ok = true;
	for i in 0..vmin.len() {
		if x[i] < vmin[i] as i32 {
			x[i] -= vmin[i] as i32; // negative value for a lack
			ok = false;
		} else if x[i] > vmax[i] as i32 {
			x[i] -= vmax[i] as i32; // positive value for an overage
			ok = false;
		} else {
			x[i] = 0; // null value if in range
		}
	}

	(x, ok) // ok = no lack and no overage
}

fn shuffle(vmin: &Vec<u32>, vmax: &Vec<u32>, mut wishes: Vec<Vec<f64>>, rand: &mut rand::XorShiftRng) -> Vec<usize>
{
	// Modify randomly the actual wishes by adding a value in (-1,1)
	for i in 0..wishes.len() {
		for j in 0..vmin.len() {
			wishes[i][j] += 0.4 * f64::powi(rand.gen_range::<f64>(-1.0, 1.0), 3);
		}
	}
	// Modify slowly the wishes according to the attractivity of each workshop up to eveybody is in his "first choice" (modified first choice)
	loop {
		let (cnt, ok) = count(&vmin, &vmax, &wishes);
		if ok { break; }

		for i in 0..wishes.len() {
			for j in 0..vmin.len() {
				wishes[i][j] += 4e-4 * rand.next_f64() * (cnt[j]*cnt[j]*cnt[j]) as f64;
			}
		}
	}

	// Extract the results
	let mut results = Vec::with_capacity(vmin.len());

	for i in 0..wishes.len() {
		results.push(min_pos(&wishes[i]));
	}

	results
}

// What we try to minimize
fn action(wishes: &Vec<Vec<u32>>, results: &Vec<usize>) -> i32 {
	let mut score = 0;
	for i in 0..wishes.len() {
		score += u32::pow(wishes[i][results[i]], 2) as i32;
	}
	score
}

pub fn search_solution(vmin: &Vec<u32>, vmax: &Vec<u32>, wishes: &Vec<Vec<u32>>, time: f64) -> Vec<Vec<usize>> {
	let mut wishesf = vec![vec![0.0; vmin.len()]; wishes.len()];
	for i in 0..wishes.len() {
		for j in 0..vmin.len() {
			wishesf[i][j] = wishes[i][j] as f64;
		}
	}

	let t0 = time::precise_time_s();

	let mut timeout = t0 + time;
	let mut best_score : i32 = -1;
	let mut best_results = Vec::new();
	let mut iterations = 0;
	let mut rand = rand::random::<rand::XorShiftRng>();

	loop {
		let results = shuffle(&vmin, &vmax, wishesf.clone(), &mut rand); // all the load is here
		let score = action(&wishes, &results);

		iterations += 1;

		if score < best_score || best_score == -1 {
			best_score = score;
			best_results.clear();

			let now = time::precise_time_s();
			timeout = now + f64::max(1.5 * (now - t0), time);
		}
		if score == best_score {
			if !best_results.contains(&results) {
				best_results.push(results);
			}
		}

		print!("Iter {it:>5} ({rate:>4.0}/s). Actual best score : {bs} x {nbs}. {left:>4.1} seconds left ", 
			bs   = best_score, 
			nbs  = best_results.len(),
			it   = iterations, 
			rate = iterations as f64 / (time::precise_time_s() - t0), 
			left = timeout - time::precise_time_s());
		
		if best_score == 0 || time::precise_time_s() > timeout {
			break;
		}
	}

	best_results.clone()
}

