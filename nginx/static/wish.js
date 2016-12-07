var hash = window.location.hash.substring(1);
var hash = hash.split("+");

var key = hash[0];
var admin_key = hash[1];

var x = null;

$(document).ready(function() {
    if (admin_key !== undefined) {
        $("#redtext").text("As admin you can modify the wishes without constraints");
    }

    $.ajax({
        type: "POST",
        url: "http://" + window.location.hostname + ":" + API_PORT + "/get_data",
        data: '{ "key" : "' + key + '" }',
        success: function(data) {
            x = JSON.parse(data);
            $("button[name='send']").bind("click", send);

            $("#name").html('<b>Activity name: </b>' + htmlEntities(x.name));
            $("#mail").html('<b>Your email: </b>' + x.mail);

            var deadline = new Date(x.deadline * 1000);
            var now = new Date();
            // x.deadline [seconds]
            // deadline [milliseconds]

            var minutes = Math.floor(Math.abs(deadline - now) / 1000 / 60);
            var hours = Math.floor(minutes / 60);
            var days = Math.floor(hours / 24);
            minutes = minutes % 60;
            hours = hours % 24;

            if (deadline > now) {
                $("#deadline").html('<b>Deadline: </b> in ' + days + ' days ' + hours + ' hours and ' + minutes + ' minutes');
            } else {
                $("#deadline").html('<b>Deadline: </b> ' + days + ' days ' + hours + ' hours and ' + minutes + ' minutes ago');
            }

            var i, content, n;
            if (deadline < now && x.results.length > 0) {
                content = '<table style="width:100%"><tr><th>Slot</th><th>Mail</th></tr>';
                n = x.slots.length;
                for (i = 0; i < n; ++i) {
                    var list = [];
                    for (var j = 0; j < x.mails.length; ++j) {
                        if (x.results[j] == i) {
                            list.push(x.mails[j]);
                        }
                    }
                    content += '<tr><th>' + x.slots[i] + '</th><th>' + list.join(", ") + '</th></tr>';
                }
                content += '</table>';
                $("#content").html(content);
                $("button[name='send']").hide();
            } else if (deadline > now) {
                content = '<table style="width:100%"><tr><th>Slot</th><th>Wish</th><th> </th></tr>';
                n = x.slots.length;
                if (n < x.wish.length) {
                    x.wish.length = n;
                }
                for (i = 0; i < n; ++i) {
                    var wish = n - 1; // default value to [dont want]
                    if (i < x.wish.length) wish = x.wish[i];
                    else x.wish[i] = wish;
                    content += '<tr><th>' + htmlEntities(x.slots[i]) + '</th><th>wanted <input type="range" name="wish' + i + '" min="0" max="' + (n - 1) + '" step="1" value="' + wish + '" /> hated</th>';
                    if (admin_key !== undefined) {
                        content += '<th><input type="checkbox" name="impossible' + i + '" ' + (wish == 1000 ? 'checked' : '') + '>avoided</th>';
                    } else {
                        if (wish == 1000) {
                            content += '<th>avoided</th>';
                        } else {
                            content += '<th></th>';
                        }
                    }
                    content += '</tr>';
                }
                content += '</table>';
                $("#content").html(content);

                //$("input").bind('input propertychange', check);
                //$("input").bind('input onclick', check);
                $("input").change(check);
            } else {
                $("#content").html("The deadline is over, the results will be generated soon !");
                $("button[name='send']").hide();
            }
        },
        error: function(data) {
            console.log(data);
            $("#name").text('Error : ' + data.responseText);
            $("button[name='send']").hide();
        },
    });
});

function check(event) {
    console.log("check event");
    var n = x.wish.length;
    var i;

    if (admin_key !== undefined) {
        for (i = 0; i < n; ++i) {
            if ($("input[name='impossible" + i + "']").prop('checked')) {
                $("input[name='wish" + i + "']").val(1000);
                x.wish[i] = 1000;
            } else {
                x.wish[i] = $("input[name='wish" + i + "']").val();
            }
        }
        return;
    }

    var wish = x.wish;

    var target = Number(event.target.name.substring(4));
    console.log("event from wish #" + target);

    var value = Number($(event.target).val());

    for (var v = x.wish[target] + 1; v <= value; ++v) {
        wish[target] = v;
        i = 0;
        var count = 0;
        for (i = 0; i < n; ++i) {
            if (wish[i] >= v) count++;
        }

        if (count > n - v) {
            for (i = 0; i < n; ++i) {
                if (i == target) continue;
                if (wish[i] == v) {
                    $("input[name='wish" + i + "']").val(v - 1);
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
        key : key,
        wish : x.wish,
        admin_key : admin_key === undefined ? "" : admin_key
    });
    console.log(payload);

    $("button[name='send']").css({
        "background-color": "#d1e2ff"
    });
    $("#error").hide();

    $.ajax({
        type: "POST",
        url: "http://" + window.location.hostname + ":" + API_PORT + "/set_wish",
        data: payload,
        success: function(data) {
            $("button[name='send']").css({
                "background-color": "#d1ffdf"
            });
            $("#error").text("Saved !");
            $("#error").show();
            setTimeout(function() {
                $("button[name='send']").removeAttr('style');
                $("#error").fadeOut();
            }, 3000);
        },
        error: function(data) {
            console.log(data);
            $("button[name='send']").css({
                "background-color": "#fc9e97"
            });
            $("#error").text(data.responseText);
            $("#error").show();
        },
    });
}
