# Wish

## Goal

Dispatch peoples amongst different slots according to each individual wishes.
This can be applied to lots of different purposes.
This project provides a web interface to create such event.
After having configured the event, unique url are created for each participant.
With the url the participant can enter his own wish by sorting the slots by preference order.

## Backend : Compile & Run

1. [Install mongodb](https://www.mongodb.com)
2. [Install rust](https://www.rust-lang.org/en-US/downloads.html)
3. Clone this repository and open a terminal in it
4. `cargo run`

## Frontend : Run

1. Install a web server like [http-server](https://www.npmjs.com/package/http-server)
2. Run it into `frontend`

## Example

1. The home page `http://localhost:3000`
![image1](https://cloud.githubusercontent.com/assets/333780/17398306/66c47054-5a3c-11e6-8faf-181695762918.png "Event creation form")
2. This is the screenshot of the page `http://localhost:3000/get/9ff2a4c34959f59e3dd3451f22004fea` before the deadline
![image2](https://cloud.githubusercontent.com/assets/333780/17398308/66f12810-5a3c-11e6-8d3e-97ad9aa72a3c.png "Student 1 form")
3. The page `http://localhost:3000/get/9ff2a4c34959f59e3dd3451f22004fea` after the deadline. The results are displayed and the student 1 is in his first choice. \\
![image3](https://cloud.githubusercontent.com/assets/333780/17398307/66dea672-5a3c-11e6-95d6-53c15ec517ce.png "Everybody see the result after the deadline")

