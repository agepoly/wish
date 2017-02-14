var socket = io();

socket.on('feedback', function(content) {
    "use strict";
    swal(content.title, content.message, content.type);
    document.getElementById('send').value = "Create";
});

if (document.readyState != 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}

function init() {
    "use strict";
    document.getElementById('nslots').onchange = create_slots;
    document.getElementById('send').onclick = send;
    create_slots();
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

    var payload = {
        name: document.getElementById('name').value,
        admin_mail: document.getElementById('admin_mail').value,
        mails: mails,
        slots: slots,
        url: window.location.origin,
        message: document.getElementById('message').value
    };

    console.log(payload);

    document.getElementById('send').value = "Please wait...";

    socket.emit("create", payload);
}

function check_validity() {
    "use strict";
    var err_color = '#FF4000';
    var valid = true;

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

    for (var i = 0; i < n; ++i) {
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

        for (i = 0; i < mails_list.length; ++i) {
            if (mails_list[i] === "") {
                mails.setAttribute('style', 'border-color: ' + err_color);
                valid = false;
            }
        }

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
    }
    if (typeof x !== 'undefined' && typeof x.mails !== 'undefined') {
        if (x.mails.length > total_vmax) {
            for (j = 0; j < n; ++j) {
                document.getElementById('vmax' + j).setAttribute('style', 'border-color: ' + err_color);
            }
            document.getElementById('slots_error').innerText = "Too many participants for the maximum bounds.";
            valid = false;
        }
        if (x.mails.length < total_vmin) {
            for (j = 0; j < n; ++j) {
                document.getElementById('vmin' + j).setAttribute('style', 'border-color: ' + err_color);
            }
            document.getElementById('slots_error').innerText = "Not enough participants for the minimum bounds.";
            valid = false;
        }
    }

    if (document.getElementById('admin_mail').value === "") {
        document.getElementById('admin_mail').setAttribute('style', 'border-color: ' + err_color);
        valid = false;
    }

    return valid;
}


var oldvalues = {
    slot: [],
    vmin: [],
    vmax: []
};

function create_slots() {
    "use strict";
    var n = Number(document.getElementById('nslots').value);
    if (n > Number(document.getElementById('nslots').getAttribute('max'))) {
        return;
    }
    var old = get_slot_val();
    for (var i = 0; i < old.slot.length; ++i) {
        oldvalues.slot[i] = old.slot[i];
        oldvalues.vmin[i] = old.vmin[i];
        oldvalues.vmax[i] = old.vmax[i];
    }

    var content = '<div class="row"><div class="six columns"><label title="Introduce the names of the activities, the time slots for the oral exam, the names of the various tasks to perform...">Slots</label></div>';
    content += '<div class="three columns"><label title="The algorithm will ensure that at least this many people are in this slot.">Min people</label></div>';
    content += '<div class="three columns"><label title="The algorithm will ensure that no more than this many people are in this slot.">Max people</label></div></div>';
    for (i = 0; i < n; ++i) {
        var values = {
            name: "",
            vmin: "0",
            vmax: "10"
        };
        if (i < oldvalues.slot.length) {
            values.name = oldvalues.slot[i];
            values.vmin = oldvalues.vmin[i];
            values.vmax = oldvalues.vmax[i];
        }
        content += '<div class="row"><div class="six columns"><input type="text" placeholder="Tuesday morning" class="slot u-full-width" id="slot' + i + '" value="' + htmlEntities(values.name) + '" title="Introduce the names of the activities, the time slots for the oral exam, the names of the various tasks to perform..."></div>';
        content += '<div class="three columns"><input type="number" class="vmin u-full-width" id="vmin' + i + '" min="0" max="100" step="1" value="' + values.vmin + '" title="The algorithm will ensure that at least this many people are in this slot."></div>';
        content += '<div class="three columns"><input type="number" class="vmax u-full-width" id="vmax' + i + '" min="0" max="100" step="1" value="' + values.vmax + '" title="The algorithm will ensure that no more than this many people are in this slot."></div></div>';
    }
    document.getElementById('slots').innerHTML = content;
    //$("input").bind('input propertychange', check_validity);
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
