//var key = window.location.pathname.split("/")[2];
var hash = window.location.hash.substring(1);
var hash = hash.split("+");

var key = hash[0];
var admin_key = hash[1];

var x = null;
var deadline = null;
var now = new Date();

$(document).ready(function() {
	console.log("get.js running");
	
	$("button[name='send']").bind("click", send);

	$.post("http://localhost:3000/get_data", '{ "key" : "'+key+'" }', function(data,status) {
		if (status == "success") {
			x = eval('(' + data + ')');
			$("#name").html('<b>Activity name: </b>'+x.name);
			$("#mail").html('<b>Your email: </b>'+x.mail);

			deadline = new Date(x.deadline * 1000);
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

			if (x.results.length > 0) {
				var content = '<table style="width:100%"><tr><th>Slot Name</th><th>Mail</th></tr>';
				var n = x.slots.length;
				for (i=0; i< n; ++i) {
					var list = [];
					for (j=0; j < x.mails.length; ++j) {
						if (x.results[j] == i) {
							list.push(x.mails[j]);
						}
					}
					content += '<tr><th>'+x.slots[i]+'</th><th>'+list.join(", ")+'</th></tr>';
				}
				content += '</table>';
				$("#content").html(content);
				$("button[name='send']").hide();
			} else {
				var content = '<table style="width:100%"><tr><th>Slot Name</th><th>Wish</th></tr>';
				var n = x.slots.length;
				for (i=0; i< n; ++i) {
					//content += '<tr><th>'+x.slots[i]+'</th><th><input type="number" name="wish'+i+'" min="1" max="'+n+'" step="1" value="'+(n-x.wish[i])+'"></th></tr>';
					content += '<tr><th>'+x.slots[i]+'</th><th>wanted <input type="range" name="wish'+i+'" min="0" max="'+(n-1)+'" step="1" value="'+x.wish[i]+'" /> hated</th></tr>';
				}
				content += '</table>';
				$("#content").html(content);
				
				if (admin_key == undefined) {
					$("input").bind('input propertychange', check);
				}
				//$("input").bind('input propertychange', color_wish);
				//color_wish();
			}
		} else {
			console.log("hello");
		}
	});
});

function set_wish(wish) {
	var n = x.slots.length;
	for (var i = 0; i < n; ++i) {
		$("input[name='wish"+i+"']").val(wish[i]);
	}
	
}

function check(event) {
	var wish = [];
	var n = x.slots.length;
	for (var i = 0; i < n; ++i) {
		wish.push(Number($("input[name='wish"+i+"']").val()));
	}
	
	var target = Number(event.target.name.substring(4));
	console.log("event from wish #"+target);
	
	var value = Number($(event.target).val());
	console.log(value);
	
	var count = 0;
	for (var i = 0; i < n; ++i) {
		if (wish[i] >= value) count++;
	}
	
	if (count > n - value) {
		for (var i = 0; i < n; ++i) {
			if (i == target) continue;
			if (wish[i] == value) {
				$("input[name='wish"+i+"']").val(value - 1);
				wish[i] = value - 1;
				
				check(event);
				break;
			}
		}
	}
}

function send() {
	var wish = [];
	var n = x.slots.length;
	for (var i = 0; i < n; ++i) {
		wish.push(Number($("input[name='wish"+i+"']").val()));
	}


	var data = '{ "key" : "'+key+'", "wish" : ['+wish.join(",")+'], "admin_key" : "'+admin_key+'" }';
	console.log(data);

	$.ajax({
		type: "POST",
		url: "http://localhost:3000/set_wish",
		data: data,
		success: function(data) {
			$("#error").show();
			$("#error").text('Set success');
			$("#error").fadeOut(1000);
		},
		error: function(data) {
			$("#error").text('The set did not succeed');
		},
	});
}

/*
function color_wish() {
	var colormap = ['#40ff00', '#80ff00', '#bfff00', '#ffff00', '#ffbf00', '#ff8000', '#ff4000', '#ff0000'];
	var n = x.slots.length;
	for (var i = 0; i < n; ++i) {
		var v = n - Number($("input[name='wish"+i+"']").val());
		// v = 0 .. n-1
		v = v * (colormap.length - 1) / (n - 1);
		v = Math.round(v);
		$("input[name='wish"+i+"']").css({'background-color' : colormap[v]});
	}
}
*/
