[wish.agepoly.ch](https://wish.agepoly.ch/)

# Wish

download the dependances

    npm install

add configuration file `src/config.js`

```js
module.exports = {
    mail: "Wish <wish@epfl.ch>",
    user: "jojo",
    password: "1234",
    host: "mail.school.com",
    port: 465,
    history_password: "1234",
    mongodb_url: "mongodb://localhost:27017/"
};
```

run the server

    nodejs src/index.js
