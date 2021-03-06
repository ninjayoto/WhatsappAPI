(function() {
	var check = function() {
		if (window["Store"]) {
			window["on_load"]();
		}
		else {
			setTimeout(check, 100);
		}
	}
	check();
})();

/*
API Listener - listens for new events (via messages) and handles them.
*/
var Listener = function() {
	
	var self = this;
	
	this.ExternalHandlers = {
		
		/*
		Parameters:
			1. The user that joined
			2. The user that added them (undefined if they used a link? Should be checked)
			3. The chat the user was added to
		*/
		USER_JOIN_GROUP: [],
		
		/*
		Parameters:
			1. The user that was removed
			2. The user that removed them (undefined if they used a link? Should be checked)
			3. The chat the user was removed from
		*/
		USER_LEAVE_GROUP: [],
		
		/*
		Parameters:
			1. The group ID
			2. The user that changed the title
			3. The new title
			4. The subject type (should be 'subject')
		*/
		GROUP_SUBJECT_CHANGE: [],
		
		/*
		Parameters:
			1. Sender of the message
			2. Chat the message was sent at
			3. Parsed Msg object
		*/
		MESSAGE_RECEIVED: []
	};
	
	/*
	Handlers for different message types
	*/
	var handlers = [
		/*
		User join / leave group.
		*/
		{
			predicate: msg => msg.__x_isNotification && msg.__x_eventType == "i" && msg.__x_type == "gp2",
			handler: function(msg) {
				var is_join = Core.chat(msg.chat.__x_id).isGroup && !!Core.find(Core.group(msg.chat.__x_id).participants, x => msg.recipients && x.__x_id == msg.recipients[0]); // If anyone has a better way to implement this one, please help!
				var object = msg.__x_recipients[0];
				var subject = msg.__x_sender;
				var chat = msg.chat.__x_id;
				
				if (is_join) {
					self.ExternalHandlers.USER_JOIN_GROUP.forEach(x => x(object, subject, chat));
				}
				else {
					self.ExternalHandlers.USER_LEAVE_GROUP.forEach(x => x(object, subject, chat));
				}
			}
		},
		/*
		Group subject change.
		*/
		{
			predicate: msg => msg.__x_isNotification && msg.__x_eventType == "n",
			handler: function(msg) {
				var chat = msg.__x_to;
				var changer = msg.__x_sender;
				var new_title = msg.__x_body;
				var subtype = msg.__x_subtype;
				self.ExternalHandlers.GROUP_SUBJECT_CHANGE.forEach(x => x(chat, changer, new_title, subtype));
			}
		},
		/*
		Message received
		*/
		{
			predicate: msg => msg.__x_isUserCreatedType && !msg.__x_isNotification && !msg.__x_isSentByMe,
			handler: function(msg) {
				var sender = msg.__x_sender;
				var chat = msg.__x_from;
				self.ExternalHandlers.MESSAGE_RECEIVED.forEach(x => x(sender, chat, msg));
			}
		}
	];
	
	/*
	Handles a new incoming message
	*/
	var handle_msg = function(msg) {
		for (var i = 0; i < handlers.length; i++) {
			if (handlers[i].predicate(msg)) {
				handlers[i].handler(msg);
				console.log("Firing handler " + i);
				return;
			}
		}
		console.log("No suitable handlers were found for ", msg);
	};
	
	/*
	Goes through messages and filters new ones out. Then calls handle_msg on the newly created ones.
	*/
	var check_update = function() {
		Store.Msg.models.forEach(model => {
			if (model.__x_isNewMsg) {
				model.__x_isNewMsg = false;
				handle_msg(model);
			}
		});
	};
	
	/*
	Clears previously created listeners and starts a new one.
	*/
	this.listen = function() {
		if (window.API_LISTENER_TOKEN) {
			clearInterval(window.API_LISTENER_TOKEN);
		}
		
		window.API_LISTENER_TOKEN = setInterval(check_update, 10);
	};
	
};

/*
The core scripts of the API. Currently is public through `window` but will be hidden in production mode.
*/
window.Core = {
	
	/*
	Returns a WhatsApp GroupMetadata object from a given group id.
	*/
	group: function(_id) {
		let result = null;
		Store.GroupMetadata.models.forEach(x => {
			if (x.hasOwnProperty("__x_id") && x.__x_id == _id) {
				result = x;
			}
		});
		return result;
	},
	
	/*
	Returns a WhatsApp Contact object from a given contact id.
	*/
	contact: function(_id) {
		let result = null;
		Store.Contact.models.forEach(x => {
			if (x.hasOwnProperty("__x_id") && x.__x_id == _id) {
				result = x;
			}
		});
		return result;
	},
	
	/*
	Returns a WhatsApp Chat object from a given chat id.
	*/
	chat: function(_id) {
		let result = null;
		Store.Chat.models.forEach(x => {
			if (x.hasOwnProperty("__x_id") && x.__x_id == _id) {
				result = x;
			}
		});
		return result;
	},
	
	/*
	Returns a WhatsApp Msg object from a given serialized messsage id
	*/
	msg: function(_id) {
		let result = null;
		Store.Msg.models.forEach(x => {
			if (x.hasOwnProperty("__x_id") && x.__x_id._serialized == _id) {
				result = x;
			}
		});
		return result;
	},
	
	/*
	Returns the element of a collection that satisfies a predicate condition.
	*/
	find: function(collection, predicate) {
		let result = null;
		collection.forEach(x => {
			if (predicate(x)) {
				result = x;
			}
		});
		return result;
	},
	
	/*
	Calls a callback with an error object.
	*/
	error: function(err, callback) {
		return {"status": "error", "error": msg};
	},
	
	/*
	Does nothing.
	*/
	nop: function() {},
	
	strip_chat: function(x) {
		m = {...x}
		delete m.mirror;
		delete m.msgs;
		delete m.collection;
		delete m._listeningTo;
		delete m.__x_mute;
		delete m._events;
		return m;
	},
	
	strip_contact: function(x) {
		m = {...x}
		delete m._events;
		delete m.collection;
		delete m.mirror;
		return m;
	},
	
	callback: function(cid, obj) {
		console.log("Callback", cid, obj);
	},
	
};

window.on_load = function() {
	
	var listener = new Listener();
	listener.listen();

	listener.ExternalHandlers.MESSAGE_RECEIVED.push(function(sender, chat, msg) {
		console.log(sender, chat, msg);
	});
}

COMMANDS = {
	/*
	Returns chat objects by title matching
	*/
	"find_chats": function(args) {
		if (!args["title"]) {
			return Core.error("No 'title' parameter provided");
		}
		var title = args.title;
		
		var res = [];
		Store.Chat.models.forEach(x => {
			if (x.hasOwnProperty("__x_formattedTitle") &&
				~x.__x_formattedTitle.indexOf(title)) {
					res.push(Core.strip_chat(x));
				}
		});
		
		return {"status": "success", "data": res};
	},
	
	/*
	Returns the contact object by phone number
	*/
	"find_contact": function(args) {
		if (!args["phone"]) {
			return Core.error("No 'phone' parameter provided");
		}
		var phone = args.phone;
		
		var res = null;
		Store.Contact.models.forEach(x => {
			if (x.hasOwnProperty("__x_id") &&
				(x.__x_id.match(/\d+/g) || []).join("") == phone)
			{
				res = Core.strip_contact(x);
			}
		});
		
		return {"status" : "success", "data": res}
	},
	
	/*
	Adds a contact to a group, based on their id
	*/
	"add_user_to_group": function(args) {
		if (!args["user_id"]) {
			return Core.error("No 'user_id' parameter provided");
		}
		var user_id = args.user_id;
		
		if (!args["group_id"]) {
			return Core.error("No 'group_id' parameter provided");
		}
		var group_id = args.group_id;
		
		var group = Core.group(group_id);
		var user = Core.contact(user_id);
		
		if (group == null) {
			return Core.error("The group ID could not be found");
		}
		
		if (user == null) {
			return Core.error("The user ID could not be found");
		}
		
		let callback_id = Math.round(Math.random() * 1e17);
		var res = group.participants.addParticipant(user).then(function() {
			Core.callback(callback_id, {"status": "success"});
		});
		
		if (res["_value"]) {
			return {"status": "undeterminate", "data": res._value.message};
		}
		return {"status": "pending", "callback": callback_id};
	},
	
	/*
	Sends a text message in a given chat.
	*/
	"send_message": function(args) {
		if (!args["chat_id"]) {
			return Core.error("No 'chat_id' parameter provided");
		}
		var chat_id = args.chat_id;
		
		if (!args["body"]) {
			return Core.error("No 'body' parameter provided");
		}
		var body = args.body;
		
		var chat = Core.chat(chat_id);
		if (chat == null) {
			return Core.error("Could not find the chat ID");
		}
		
		let callback_id = Math.round(Math.random() * 1e17);
		var res = chat.sendMessage(body).then(function(e) {
			Core.callback(callback_id, {"status": "success"});
		});
		
		if (res["_value"]) {
			return {"status": "undeterminate", "data": res._value.message};
		}
		return {"status": "pending", "callback": callback_id};
	}
}