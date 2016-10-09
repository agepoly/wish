//var key = window.location.pathname.split("/")[2];
var hash = window.location.hash.substring(1);
var hash = hash.split("+");

var admin_key = hash[0];

var x = null;

$(document).ready(function() {
	console.log("admin.js running");
	
	$.post("http://localhost:3000/get_admin_data", '{ "key" : "'+admin_key+'" }', function(data,status) {
		if (status == "success") {
			x = eval('(' + data + ')');
			$("#name").html('<b>Activity name: </b>'+x.name);

			deadline = new Date(x.deadline * 1000);
			// x.deadline [seconds]
			// deadline [milliseconds]

			var content = '<table style="width:100%"><tr><th>Mail</th><th>Wish</th></tr>';
			var n = x.slots.length;
			var m = x.mails.length;
			for (i=0; i< m; ++i) {
				var key = x.keys[i];
				var url = "http://" + window.location.hostname + ":" + window.location.port + "/get#"+key+"+"+admin_key;
				content += '<tr><th>'+x.mails[i]+'</th><th><a href="'+url+'">'+url+'</a></th></tr>';
			}
			content += '</table>';
			$("#content").html(content);
		}
	});
});
