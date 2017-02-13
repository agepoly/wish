var socket = io();
var x = null;

socket.on("get wish", function(content) {
    "use strict";
    x = content;
    if (document.readyState != 'loading') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
});

socket.on('feedback', function(content) {
    "use strict";
    swal(content.title, content.message, content.type);
    document.getElementById('save').value = "Save";
});

socket.emit("get wish", window.location.hash.substring(1));

function init() {
    "use strict";
    var i;

    document.getElementById('save').onclick = function() {
        console.log(x);
        document.getElementById('save').value = "Please wait...";

        socket.emit("set wish", {
            key: window.location.hash.substring(1),
            wish: x.wish
        });
    };
    document.getElementById('mail').innerHTML = x.mail;
    document.getElementById('name').innerHTML = '<b>Activity name: </b>' + htmlEntities(x.name);

    var content = '<table class="u-full-width"><thead><tr><th>Slot</th><th>Your Wish</th></tr></thead><tbody>';
    for (i = 0; i < x.slots.length; ++i) {
        content += '<tr><td>' + htmlEntities(x.slots[i]) + '</td><td>wanted <input type="range" name="wish' + i + '" min="0" max="' + (x.slots.length - 1) + '" step="1" value="' + x.wish[i] + '" /> hated</td></tr>';
    }
    content += '</tbody></table>';
    document.getElementById("content").innerHTML = content;

    var inputs = document.getElementsByTagName('input');
    for (i = 0; i < inputs.length; ++i) {
        inputs[i].onchange = check;
    }
}

function check(event) {
    "use strict";
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
                    document.getElementsByName('wish' + i)[0].value = v - 1;
                    wish[i] = v - 1;
                    break;
                }
            }
        }
    }
    wish[target] = value;

    x.wish = wish;
}
