var socket = io();
var wish = null;

socket.on("get wish", function(content) {
    "use strict";
    if (document.readyState != 'loading') {
        init(content);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            init(content);
        });
    }
});

socket.on('feedback', function(content) {
    "use strict";
    swal(content.title, content.message, content.type);
    document.getElementById('save').value = "Save";
});

socket.emit("get wish", window.location.hash.substring(1));

function init(content) {
    "use strict";
    var i;

    wish = content.wish;

    document.getElementById('save').onclick = function() {
        document.getElementById('save').value = "Please wait...";

        socket.emit("set wish", {
            key: window.location.hash.substring(1),
            wish: wish
        });
    };
    document.getElementById('mail').innerHTML = content.mail;
    document.getElementById('name').innerHTML = Mustache.render('<b>Activity name: </b> {{name}}', { name: content.name });

    var html = '<table class="u-full-width"><thead><tr><th>Slot</th><th>Your Wish</th></tr></thead><tbody>';
    for (i = 0; i < content.slots.length; ++i) {
        html += Mustache.render('<tr><td>{{name}}</td><td>wanted <input id="wish{{no}}" type="range" min="0" max="{{max}}" step="1" value="{{value}}"> hated</td></tr>', {
            name: content.slots[i].name,
            no: i,
            max: content.slots.length - 1,
            value: wish[i]
        });
    }
    html += '</tbody></table>';
    document.getElementById("content").innerHTML = html;

    for (i = 0; i < content.slots.length; ++i) {
        var input = document.getElementById('wish' + i);
        input.onchange = slider_moved;
        if (input.value != wish[i]) {
            swal('Value out of bounds', Mustache.render('The value in the slot <strong>{{slot}}</strong> is out of bounds.</br>By saving, you put it back in the ranges.', { slot: content.slots[i].name }));
        }
        wish[i] = Number(input.value);
    }
}

function slider_moved(event) {
    "use strict";
    var i;


    var slot = Number(event.target.id.substring(4));
    var value = Number(event.target.value);
    console.log("slot = " + slot + " value = " + value);

    for (var v = wish[slot] + 1; v <= value; ++v) {
        wish[slot] = v;

        var count = 0;
        for (i = 0; i < wish.length; ++i) {
            if (wish[i] >= v) count++;
        }

        if (count > wish.length - v) {
            for (i = 0; i < wish.length; ++i) {
                if (i == slot) continue;
                if (wish[i] == v) {
                    document.getElementById('wish' + i).value = v - 1;
                    wish[i] = v - 1;
                    break;
                }
            }
        }
    }
    wish[slot] = value;
}
