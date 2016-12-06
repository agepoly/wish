var hash = window.location.hash.substring(1);
var hash = hash.split("+");

var admin_key = hash[0];

var x = null;

$(document).ready(function() {
    $("input[name='nslots']").bind('input propertychange', function() {
        create_slots();
        $("input").bind('input propertychange', check_validity);
    });
    $("input[name='deadline']").hide();
    $("label").hide();
    $("input[name='nslots']").hide();

    $("button[name='save']").bind("click", save);
    $("input[name='deadline']").datepicker({
        showOtherMonths: true,
        selectOtherMonths: true,
        dateFormat: "yy-mm-dd",
        onSelect: function() {
            check_validity();
        },
        minDate: 0
    });

    $.ajax({
        type: "POST",
        url: "http://" + window.location.hostname + ":" + API_PORT + "/get_admin_data",
        data: '{ "key" : "' + admin_key + '" }',
        success: function(data) {
            x = JSON.parse(data);
            $("#name").html('<b>Activity name: </b>' + htmlEntities(x.name));

            deadline = new Date(x.deadline * 1000);
            $("input[name='deadline']").datepicker("setDate", deadline);

            var n = x.slots.length;
            var m = x.mails.length;

            var content = '<table style="width:100%"><tr><th>Mail</th> <th>Wish page link : view from...</th> <th>Mail status</th></tr>';
            for (i = 0; i < m; ++i) {
                var key = x.keys[i];
                var url = "http://" + window.location.hostname + ":" + window.location.port + "/wish#" + key;
                var aurl = url + "+" + admin_key;
                content += '<tr>' +
                    '<th>' + x.mails[i] + '</th>' +
                    '<th><a href="' + url + '" title="Access the page with user’s rights.">user</a> or <a href="' + aurl + '" title="Access the page with override rights.">admin</a></th>';
                if (x.sent[i]) {
                    content += '<th>mail sent</th>';
                } else {
                    content += '<th title="If you refresh the page, we will try again to send the invitation mail to this address.">mail not sent</th>';
                }
                content += '</tr>';
            }
            content += '</table>';
            $("#people").html(content);

            oldvalues.slot = x.slots;
            oldvalues.vmin = x.vmin;
            oldvalues.vmax = x.vmax;
            $("input[name='nslots']").val(x.slots.length);
            create_slots();
            $("input").bind('input propertychange', check_validity);

            check_validity();
            if (x.results.length > 0) //Check if results are there now ?
            {
                exportcsv();
                console.log('One have results');
            }
            $("input").bind('input propertychange', check_validity);

            $("button[name=save]").show();
            $("#explanation").show();
            $("input[name='deadline']").show();
            $("label").show();
            $("input[name='nslots']").show();

            if (x.error !== "") {
                swal("Oops...", "Something went wrong!\n" + x.error, "error");
            }
        },
        error: function(data) {
            swal("Oops...", "Something went wrong!\n" + data.responseText, "error");
        },
    });
});

function save() {
    if (!check_validity()) {
        return;
    }

    var slots = get_slot_val();
    var deadline = $("input[name='deadline']").datepicker("getDate");
    if (deadline === null) {
        deadline = 0;
    } else {
        deadline = deadline.getTime() / 1000;
    }

    var payload = JSON.stringify({
        key : admin_key,
        deadline : deadline,
        slots : slots.slot,
        vmin : slots.vmin,
        vmax : slots.vmax
    });

    console.log(payload);

    $("button[name='save']").prop('disabled', true);
    $("button[name='save']").text('Request sent...');
    $("#error").hide();

    $.ajax({
        type: "POST",
        url: "http://" + window.location.hostname + ":" + API_PORT + "/admin_update",
        data: payload,
        success: function(data) {
            $("#error").show();
            $("#error").text('Set successfully');
            setTimeout(function() {
                $("#error").fadeOut();
            }, 5000);
            $("button[name='save']").prop('disabled', false);
            $("button[name='save']").text('Save');
        },
        error: function(data) {
            console.log(data);
            $("#error").show();
            $("#error").text('Error : ' + data.responseText);
            $("button[name='save']").prop('disabled', false);
            $("button[name='save']").text('Save');
        },
    });
}

function exportcsv() {
    console.log('Entered export() function');
    var n = x.slots.length;
    var m = x.mails.length;

    var content = '';
    for (i = 0; i < n; ++i) {
        var list = [];
        for (var j = 0; j < m; ++j) {
            if (x.results[j] == i) {
                list.push(x.mails[j]);
            }
        }
        content += x.slots[i] + ', ' + list.join(", ") + '\n';
    }
    var encodedURI = encodeURIComponent(content);
    var link = document.createElement("a");
    link.href = 'data:attachment/csv,' + encodedURI;
    link.target = '_blank';
    link.download = 'datas.csv';
    link.innerHTML = "datas.csv";
    var intro = document.getElementById('intro');
    var text = document.createTextNode(" Results are there : ");
    intro.appendChild(text);
    intro.appendChild(link);
    console.log(link);
}
