var socket = io();

socket.on('feedback', swal);

if (document.readyState != 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}

function init() {
    "use strict";
    document.getElementById('send').onclick = send;
    document.getElementById('clear').onclick = clear;

    document.getElementById('name').value = localStorage.name || "";
    document.getElementById('name').onchange = function(event) {
        localStorage.name = event.target.value;
    };

    document.getElementById('nslots').value = localStorage.nslots || "2";
    document.getElementById('nslots').onchange = function(event) {
        localStorage.nslots = event.target.value;
        create_slots();
    };

    document.getElementById('admin_mail').value = localStorage.admin_mail || "";
    document.getElementById('admin_mail').onchange = function(event) {
        localStorage.admin_mail = event.target.value;
    };

    document.getElementById('mails').value = localStorage.mails || "";
    document.getElementById('mails').onchange = function(event) {
        localStorage.mails = event.target.value;
        count_participants();
    };

    document.getElementById('message').value = localStorage.message || "";
    document.getElementById('message').onchange = function(event) {
        localStorage.message = event.target.value;
    };

    create_slots();
    count_participants();
}

function count_participants() {
    "use strict";
    var mails_list = mails.value.split(/[\s,;]+/).filter(function(x) { return x !== ''; });
    document.getElementById('participants_counter').innerText = mails_list.length + " participants";
}

function send() {
    "use strict";

    if (!check_validity()) {
        return;
    }

    var slots = get_slots();

    var mails = document.getElementById('mails').value;
    mails = mails.split(/[\s,;]+/).filter(function(x) {
        return x !== '';
    });

    socket.emit("create", {
        name: document.getElementById('name').value,
        admin_mail: document.getElementById('admin_mail').value,
        mails: mails,
        slots: slots,
        url: window.location.origin,
        message: document.getElementById('message').value
    });

    swal({
        title: 'Status',
        html: '<ol><li>Request sent</li><li><strong>Waiting for server response...</strong></li></ol>',
        showConfirmButton: false,
        type: 'info'
    });
}

function clear() {
    "use strict";

    document.getElementById('name').value = "";
    document.getElementById('admin_mail').value = "";
    document.getElementById('mails').value = "";
    document.getElementById('message').value = "";

    document.getElementById('slots').innerHTML = "";
    localStorage.clear();
    create_slots();
}

function check_validity() {
    "use strict";
    var err_color = '#FF4000';
    var valid = true;
    var i, j;

    var xs = document.getElementsByTagName('input');
    for (i = 0; i < xs.length; ++i) {
        xs[i].removeAttribute('style');
    }
    document.getElementById('mails').removeAttribute('style');
    document.getElementById('mails_error').innerText = "";
    document.getElementById('slots_error').innerText = "";

    var name = document.getElementById('name');
    if (name.value === "") {
        name.setAttribute('style', 'border-color: ' + err_color);
        valid = false;
    }

    var n = Number(document.getElementById('nslots').value);

    var total_vmin = 0;
    var total_vmax = 0;

    for (i = 0; i < n; ++i) {
        var slot = document.getElementById('slot' + i);
        if (slot.value === "") {
            slot.setAttribute('style', 'border-color: ' + err_color);
            document.getElementById('slots_error').innerText = "A slot name is empty.";
            valid = false;
        }
        var vmin = document.getElementById('vmin' + i);
        var vmax = document.getElementById('vmax' + i);
        if (Number(vmin.value) < 0) {
            vmin.setAttribute('style', 'border-color: ' + err_color);
            document.getElementById('slots_error').innerText = "Minimum bounds must be a non-negative number.";
            valid = false;
        }
        if (Number(vmax.value) <= 0) {
            vmax.setAttribute('style', 'border-color: ' + err_color);
            document.getElementById('slots_error').innerText = "Maximum bounds must be a positive number.";
            valid = false;
        }
        if (Number(vmin.value) > Number(vmax.value)) {
            vmin.setAttribute('style', 'border-color: ' + err_color);
            vmax.setAttribute('style', 'border-color: ' + err_color);
            document.getElementById('slots_error').innerText = "Maximum bound must be greater or equal to minimum bound.";
            valid = false;
        }
        total_vmin += Number(vmin.value);
        total_vmax += Number(vmax.value);
    }

    var mails = document.getElementById('mails');
    if (mails !== null) {
        if (mails.value === "") {
            mails.setAttribute('style', 'border-color: ' + err_color);
            document.getElementById('mails_error').innerText = "You need to enter the participants mails.";
            valid = false;
        }

        var mails_list = mails.value.split(/[\s,;]+/).filter(function(x) { return x !== ''; });

        if (mails_list.length > total_vmax) {
            for (j = 0; j < n; ++j) {
                document.getElementById('vmax' + j).setAttribute('style', 'border-color: ' + err_color);
            }
            mails.setAttribute('style', 'border-color: ' + err_color);

            document.getElementById('slots_error').innerText = "Too many participants for the maximum bounds.";
            document.getElementById('mails_error').innerText = "Too many participants for the maximum bounds.";
            valid = false;
        }
        if (mails_list.length < total_vmin) {
            for (j = 0; j < n; ++j) {
                document.getElementById('vmin' + j).setAttribute('style', 'border-color: ' + err_color);
            }
            mails.setAttribute('style', 'border-color: ' + err_color);

            document.getElementById('slots_error').innerText = "Not enough participants for the minimum bounds.";
            document.getElementById('mails_error').innerText = "Not enough participants for the minimum bounds.";
            valid = false;
        }

        mails_list.sort();
        for (i = 1; i < mails_list.length; ++i) {
            if (mails_list[i - 1] == mails_list[i]) {
                mails.setAttribute('style', 'border-color: ' + err_color);
                document.getElementById('mails_error').innerText = "A mail address appear more than once.";
                valid = false;
            }
        }

        for (i = 0; i < mails_list.length; ++i) {
            var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            if (!re.test(mails_list[i])) {
                document.getElementById('mails_error').innerText = mails_list[i] + " is not a valid email address.";
                valid = false;
            }
        }
    }

    if (document.getElementById('admin_mail').value === "") {
        document.getElementById('admin_mail').setAttribute('style', 'border-color: ' + err_color);
        valid = false;
    }

    return valid;
}

function save_slots_in_local_storage() {
    "use strict";
    var saved_slots = JSON.parse(localStorage.saved_slots || "[]");
    var current_slots = get_slots();
    for (var i = 0; i < current_slots.length; ++i) {
        saved_slots[i] = current_slots[i];
    }
    localStorage.saved_slots = JSON.stringify(saved_slots);
    return saved_slots;
}

function create_slots() {
    "use strict";
    var i;
    var n = Number(document.getElementById('nslots').value);
    if (n > Number(document.getElementById('nslots').getAttribute('max'))) {
        return;
    }
    var saved_slots = save_slots_in_local_storage();

    var content = document.getElementById("slots_header").innerHTML;

    for (i = 0; i < n; ++i) {
        var must = {
            no: i,
            name: "",
            vmin: 0,
            vmax: 10
        };
        if (saved_slots[i]) {
            must.name = saved_slots[i].name;
            must.vmin = saved_slots[i].vmin;
            must.vmax = saved_slots[i].vmax;
        }
        content += Mustache.render(document.getElementById("slots_entry").innerHTML, must);
    }
    document.getElementById('slots').innerHTML = content;
    for (i = 0; i < n; ++i) {
        document.getElementById('slot' + i).onchange = save_slots_in_local_storage;
        document.getElementById('vmin' + i).onchange = save_slots_in_local_storage;
        document.getElementById('vmax' + i).onchange = save_slots_in_local_storage;
    }
}

function get_slots() {
    "use strict";
    var slots = [];
    for (var i = 0; document.getElementById('slot' + i) !== null; ++i) {
        slots[i] = {
            name: document.getElementById('slot' + i).value,
            vmin: Number(document.getElementById('vmin' + i).value),
            vmax: Number(document.getElementById('vmax' + i).value)
        };
    }

    return slots;
}
