var socket = io();

socket.on("get history", function(content) {
    "use strict";
    if (document.readyState != 'loading') {
        init(content);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            init(content);
        });
    }
});

socket.emit("ask history");

function init(content) {
    "use strict";

    document.getElementById("list_events").innerHTML = content;
}
