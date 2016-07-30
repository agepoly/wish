# Activities-Web

## Goal

Dispatch peoples amongst different slots according to each individual wishes.
This can be applied to lots of different purposes.
This project provides a web interface to create such event.
After having configured the event, unique url are created for each participant.
With the url the participant can enter his own wish by sorting the slots by preference order.

## Compile & Run

1. [Install rust](https://www.rust-lang.org/en-US/downloads.html)
2. Clone this repository and open a terminal in it
3. `cargo run`

## Example

1. The home page `http://localhost:3000`
![alt text](https://raw.githubusercontent.com/antigol/activities-web/master/image1.png "Event creation form")
2. This is the screenshot of the page `http://localhost:3000/get/9ff2a4c34959f59e3dd3451f22004fea` before the deadline
![alt text](https://raw.githubusercontent.com/antigol/activities-web/master/image2.png "Student 1 form")
3. The page `http://localhost:3000/get/9ff2a4c34959f59e3dd3451f22004fea` after the deadline. The results are displayed and the student 1 is in his first choice.
![alt text](https://raw.githubusercontent.com/antigol/activities-web/master/image3.png "Everybody see the result after the deadline")
