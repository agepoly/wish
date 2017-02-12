var x = null;

function main() {
    var i, n;

    document.getElementById('save').onclick = send;
    document.getElementById('mail').innerHTML = x.mail;
    document.getElementById('name').innerHTML = '<b>Activity name: </b>' + htmlEntities(x.name);

    var content = '<table class="u-full-width"><thead><tr><th>Slot</th><th>Your Wish</th></tr></thead><tbody>';
    n = x.slots.length;
    for (i = 0; i < n; ++i) {
        content += '<tr><td>' + htmlEntities(x.slots[i]) + '</td><td>wanted <input type="range" name="wish' + i + '" min="0" max="' + (n - 1) + '" step="1" value="' + x.wish + '" /> hated</td></tr>';
    }
    content += '</tbody></table>';
    document.getElementById("content").innerHTML = content;

    for (var input in document.getElementsByTagName('input')) {
        input.onchange = check;
    }
}

function check(event) {
    var n = x.wish.length;
    var i;

    var wish = x.wish.slice(0);

    var target = Number(event.target.name.substring(4));
    console.log("event from wish #" + target);

    var value = Number(event.target.value);

    for (var v = x.wish[target] + 1; v <= value; ++v) {
        wish[target] = v;

        var count = 0;
        for (i = 0; i < n; ++i) {
            if (wish[i] >= v) count++;
        }

        if (count > n - v) {
            for (i = 0; i < n; ++i) {
                if (i == target) continue;
                if (wish[i] == v) {
                    for (var e in document.getElementsByName('wish' + i)) {
                        e.value = v - 1;
                    }
                    wish[i] = v - 1;
                    break;
                }
            }
        }
    }
    wish[target] = value;

    x.wish = wish;
}

function send() {
    var payload = JSON.stringify({
        key: window.location.hash.substring(1)[0],
        wish: x.wish
    });
    console.log(payload);

    var request = new XMLHttpRequest();
    request.open('POST', window.location.origin + '/set_wish', true);

    request.onload = function() {
        if (this.status >= 200 && this.status < 400) {
            swal("Success", "Saved!", "success");
        } else {
            swal("Oops...", "Something went wrong!", "error");
        }
    };

    request.onerror = function() {
        swal("Oops...", "There was a connection error of some sort!", "error");
    };

    request.send(payload);
}



// Get x and run main

var request = new XMLHttpRequest();
request.open('POST', window.location.origin + '/get_wish', true);

request.onload = function() {
    if (this.status >= 200 && this.status < 400) {
        // Success!
        x = JSON.parse(this.response);
        if (document.readyState != 'loading') {
            main();
        } else {
            document.addEventListener('DOMContentLoaded', main);
        }
    } else {
        swal("Oops...", "Something went wrong!", "error");
    }
};

request.onerror = function() {
    swal("Oops...", "There was a connection error of some sort!", "error");
};

var payload = JSON.stringify({
    key: window.location.hash.substring(1),
});

request.send(payload);
