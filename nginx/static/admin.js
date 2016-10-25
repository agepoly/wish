var hash = window.location.hash.substring(1);
var hash = hash.split("+");

var admin_key = hash[0];

var x = null;

$(document).ready(function() {
	$("input[name='deadline']").hide();
	
	$("button[name='save']").bind("click", save);
	$("input[name='deadline']").datepicker({
		showOtherMonths: true,
		selectOtherMonths: true,
		dateFormat: "yy-mm-dd",
		onSelect: function() {
			check_validity();
		}
    });

	$.ajax({
		type: "POST",
		url: "http://"+window.location.hostname+":3000/get_admin_data",
		data: '{ "key" : "'+admin_key+'" }',
		success: function(data) {
			x = eval('(' + data + ')');
			$("#name").html('<b>Activity name: </b>'+x.name);

			deadline = new Date(x.deadline * 1000);
			$("input[name='deadline']").datepicker("setDate", deadline);

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
			
			$("button").show();
			$("#explanation").show();
			$("input[name='deadline']").show();
		},
		error: function(data) {
			swal("Oops...", "Something went wrong!\n" + data.responseText, "error");
		},
	});
});

function save() {
	var slots = get_slot_val();
	var deadline = $("input[name='deadline']").datepicker("getDate");
	if (deadline == null) {
		deadline = 0;
	} else {
		deadline = deadline.getTime() / 1000;
	}

	var payload = '{'
		+'"key": "'+admin_key+'", '
		+'"deadline" : '+deadline+', '
		+'"slots"    : ["'+slots.slot.join('","')+'"], '
		+'"vmin"     : ['+ slots.vmin.join(',')  +'], '
		+'"vmax"     : ['+ slots.vmax.join(',')  +']'
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

