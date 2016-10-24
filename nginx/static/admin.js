//var key = window.location.pathname.split("/")[2];
var hash = window.location.hash.substring(1);
var hash = hash.split("+");

var admin_key = hash[0];

var x = null;

$(document).ready(function() {
	console.log("admin.js running");
	
	$("button[name='save']").bind("click", save);
	
	$.post("http://"+window.location.hostname+":3000/get_admin_data", '{ "key" : "'+admin_key+'" }', function(data,status) {
		if (status == "success") {
			x = eval('(' + data + ')');
			$("#name").html('<b>Activity name: </b>'+x.name);

			deadline = new Date(x.deadline * 1000);
			// x.deadline [seconds]
			// deadline [milliseconds]
			var day = ("0" + deadline.getDate()).slice(-2);
			var month = ("0" + (deadline.getMonth() + 1)).slice(-2);
			var date = deadline.getFullYear()+"-"+(month)+"-"+(day);
			console.log(date);
			$("input[name='deadline']").val(date);

			var n = x.slots.length;
			var m = x.mails.length;

			var content = '<table style="width:100%"><tr><th>Mail</th> <th>Wish</th> <th>Admin link</th> <th>Mail status</th>';
			for (i=0; i < m; ++i) {
				var key = x.keys[i];
				var url = "http://" + window.location.hostname + ":" + window.location.port + "/wish#"+key;
				var aurl = url+"+"+admin_key;
				content += '<tr>'
					+'<th>'+x.mails[i]+'</th>'
					+'<th><a href="'+url+'">user page</a></th>'
					+'<th><a href="'+aurl+'">admin user page</a></th>'
					+'<th>'+(x.sent[i] ? 'mail sent' : 'mail failed')+'</th>'
					+'</tr>';
			}
			content += '</table>';
			$("#people").html(content);
			
			
			var content = '<div class="row"><div class="six columns"><label>Time slots</label></div>'
			content += '<div class="three columns"><label>Min people</label></div>'
			content += '<div class="three columns"><label>Max people</label></div></div>'
			for (i=0; i < n; ++i) {
				var values = {
					name: x.slots[i],
					vmin: x.vmin[i],
					vmax: x.vmax[i]
				};
				content += '<div class="row"><div class="six columns"><input type="text" placeholder="Tuesday morning" class="slot u-full-width" name="slot'+i+'" value="'+values.name+'"></div>'
					+ '<div class="three columns"><input type="number" class="vmin u-full-width" name="vmin'+i+'" min="0" max="100" step="1" value="'+values.vmin+'"></div>'
					+ '<div class="three columns"><input type="number" class="vmax u-full-width" name="vmax'+i+'" min="0" max="100" step="1" value="'+values.vmax+'"></div></div>'
			}
			$("#slots").html(content);

			check_validity();
			$("input").bind('input propertychange', check_validity);
		}
	});
});

function save() {
	var slot = [];
	var vmin = [];
	var vmax = [];
	for (var i = 0; $("input[name='slot"+i+"']").length; ++i) {
		slot.push($("input[name='slot"+i+"']").val());
		vmin.push($("input[name='vmin"+i+"']").val());
		vmax.push($("input[name='vmax"+i+"']").val());
	}
	var deadline = new Date($("input[name='deadline']").val()).getTime() / 1000;

	var payload = '{'
		+'"key": "'+admin_key+'", '
		+'"deadline" : '+deadline+', '
		+'"slots"    : ["'+slot.join('","')+'"], '
		+'"vmin"     : ['+ vmin.join(',')  +'], '
		+'"vmax"     : ['+ vmax.join(',')  +']'
		+'}';

	console.log(payload);
	
	$("button[name='save']").prop('disabled', true);
	$("button[name='save']").text('Request sent...');
	$("#error").hide();

	$.ajax({
		type: "POST",
		url: "http://"+window.location.hostname+":3000/admin_update",
		data: payload,
		success: function(data) {
			$("#error").show();
			$("#error").text('Set success');
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


function check_validity() {
	var err_color = '#FF9000';

	$("input").removeAttr('style');

	for (var i = 0; $("input[name='slot"+i+"']").length; ++i) {
		if ($("input[name='slot"+i+"']").val() == "") {
			$("input[name='slot"+i+"']").css({'border-color' : err_color});
		}
		var vmin = Number($("input[name='vmin"+i+"']").val());
		var vmax = Number($("input[name='vmax"+i+"']").val());
		if (vmin < 0) {
			$("input[name='vmin"+i+"']").css({'border-color' : err_color});
		}
		if (vmax <= 0) {
			$("input[name='vmax"+i+"']").css({'border-color' : err_color});
		}
		if (vmin > vmax) {
			$("input[name='vmin"+i+"']").css({'border-color' : err_color});
			$("input[name='vmax"+i+"']").css({'border-color' : err_color});
		}
	}

	if ($("input[name='deadline']").val() == "") {
		$("input[name='deadline']").css({'border-color' : err_color});
	}
}
