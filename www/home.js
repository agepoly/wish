function main() {
    document.getElementById('nslots').onchange = create_slots;
    document.getElementById('send').onclick = send;
    create_slots();
}

if (document.readyState != 'loading') {
    main();
} else {
    document.addEventListener('DOMContentLoaded', main);
}

function send() {
    if (!check_validity()) {
        return;
    }

    var slots = get_slot_val();

    var mails = document.getElementById('mails').value;
    mails = mails.split(/[\s,;]+/).filter(function(x) {
        return x !== '';
    });

    var payload = JSON.stringify({
        name: document.getElementById('name').value,
        admin_mail: document.getElementById('admin_mail').value,
        mails: mails,
        slots: slots.slot,
        vmin: slots.vmin,
        vmax: slots.vmax,
        url: window.location.origin,
        message: document.getElementById('message').value
    });

    console.log(payload);

    document.getElementById('send').value = "Please wait...";

    var request = new XMLHttpRequest();
    request.open('POST', window.location.origin + '/create', true);

    request.onload = function() {
        if (this.status >= 200 && this.status < 400) {
            swal("Creation succeed!", "A mail has been sent to " + payload.admin_mail + " to validate the activity.", "success");
        } else {
            swal("Oops...", "Something went wrong!", "error");
        }
        document.getElementById('send').value = "Re create";
    };

    request.onerror = function() {
        swal("Oops...", "There was a connection error of some sort!", "error");
    };

    request.send(payload);
}
