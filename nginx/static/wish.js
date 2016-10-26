var hash = window.location.hash.substring(1);
var hash = hash.split("+");

var key = hash[0];
var admin_key = hash[1];

var x = null;

$(document).ready(function() {
	console.log("get.js running");
	
	$("button[name='send']").bind("click", send);

	$.ajax({
		type: "POST",
		url: "http://"+window.location.hostname+":3000/get_data",
		data: '{ "key" : "'+key+'" }',
		success: function(data) {
			x = eval('(' + data + ')');
			$("#name").html('<b>Activity name: </b>'+x.name);
			$("#mail").html('<b>Your email: </b>'+x.mail);

			var deadline = new Date(x.deadline * 1000);
			var now = new Date();
			// x.deadline [seconds]
			// deadline [milliseconds]

			if (deadline > now) {
				var hours = Math.floor((deadline-now)/1000/3600);
				var days = Math.floor(hours / 24);
				hours = hours % 24;
				$("#deadline").html('<b>Deadline: </b>'+deadline.toJSON().split('T')[0]+' (in '+days+' days and '+hours+' hours)');
			} else {
				var days = Math.floor((now-deadline)/1000/3600/24);
				$("#deadline").html('<b>Deadline: </b>'+deadline.toJSON().split('T')[0]+' ('+days+' days ago)');
			}

			if (deadline < now && x.results.length > 0) {
				var content = '<table style="width:100%"><tr><th>Slot</th><th>Mail</th></tr>';
				var n = x.slots.length;
				for (i=0; i< n; ++i) {
					var list = [];
					for (var j = 0; j < x.mails.length; ++j) {
						if (x.results[j] == i) {
							list.push(x.mails[j]);
						}
					}
					content += '<tr><th>'+x.slots[i]+'</th><th>'+list.join(", ")+'</th></tr>';
				}
				content += '</table>';
				$("#content").html(content);
				$("button[name='send']").hide();
			} else if (deadline > now) {
				var content = '<table style="width:100%"><tr><th>Slot</th><th>Wish</th></tr>';
				var n = x.slots.length;
				for (var i = 0; i < n; ++i) {
					content += '<tr><th>'+x.slots[i]+'</th><th>wanted <input type="range" name="wish'+i+'" min="0" max="'+(n-1)+'" step="1" value="'+x.wish[i]+'" /> hated</th></tr>';
				}
				content += '</table>';
				$("#content").html(content);
				
				$("input").bind('input propertychange', check);
			} else {
				$("#content").html("The deadline is over, the results will be generated soon !");
				$("button[name='send']").hide();
			}
		},
		error: function(data) {
			console.log(data);
			$("#name").text('Error : ' + data.responseText);
		},
	});
});

function check(event) {
	var n = x.wish.length;
	
	if (admin_key != undefined) {
		for (var i = 0; i < n; ++i) {
			x.wish[i] = $("input[name='wish"+i+"']").val();
		}
		return;
	}
	
	var wish = x.wish;

	var target = Number(event.target.name.substring(4));
	console.log("event from wish #"+target);
	
	var value = Number($(event.target).val());
		
	for (var v = x.wish[target] + 1; v <= value; ++v) {
		wish[target] = v;
	
		var count = 0;
		for (var i = 0; i < n; ++i) {
			if (wish[i] >= v) count++;
		}
	
		if (count > n - v) {
			for (var i = 0; i < n; ++i) {
				if (i == target) continue;
				if (wish[i] == v) {
					$("input[name='wish"+i+"']").val(v - 1);
					wish[i] = v - 1;
				}
			}
		}
	}
	wish[target] = value;
	
	x.wish = wish;
}

function send() {
	var data = '{ "key" : "'+key+'", "wish" : ['+x.wish.join(",")+'], "admin_key" : "'+admin_key+'" }';
	console.log(data);
	
	$("button[name='send']").css({"background-color" : "#0f56c6"});
	$("#error").hide();
	
	$.ajax({
		type: "POST",
		url: "http://"+window.location.hostname+":3000/set_wish",
		data: data,
		success: function(data) {
			$("button[name='send']").css({"background-color" : "#68ff98"});
			$("#error").text("Saved !");
			$("#error").show();
			setTimeout(function() {
				$("button[name='send']").removeAttr('style');
				$("#error").fadeOut();
			}, 3000);
		},
		error: function(data) {
			console.log(data);
			$("button[name='send']").css({"background-color" : "#c42b2b"});
			$("#error").text(data.responseText);
		},
	});
}

