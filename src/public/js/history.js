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

socket.emit("ask history", window.location.hash.substring(1) + window.location.search.substring(1));

function init(content) {
    "use strict";

    document.getElementById("list_events").innerHTML = content;
}
