import { v4 as uuidv4 } from "uuid";

// CORS management function
function manageCORSForRequests(response) {
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
	response.headers.set("Access-Control-Allow-Headers", "Content-Type");
	return response;
}

// Handler for the API requests
export default {
	async fetch(request, env, ctx) {

		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				}
			});
		}

		if (request.method === "POST" && request.url.endsWith("/api/notifications")) {
			return manageCORSForRequests(await createNotifications(request, env));
		} else if (request.method === "GET" && request.url.endsWith("/api/notifications")) {
			return manageCORSForRequests(await retrieveNotifications(env));
		} else if (request.method === "DELETE" && request.url.endsWith("/api/notifications")) {
			return manageCORSForRequests(await deleteAllNotifications(env));
		} else if (request.method === "GET" && request.url.endsWith("/api/preferences")) {
			return manageCORSForRequests(await setPreferencesCookie(request));
		} else if (request.method === "POST" && request.url.endsWith("/api/ai")) {
			return manageCORSForRequests(await classifyNotification(request, env));
		}
		return new Response("Invalid request", { status: 404 });
	}
};


// Function to create notifications

async function createNotifications(request, env) {
	try {
		const data = await request.json();
		console.log('data: ', data);
		const notifications = Array.isArray(data) ? data : [data];
		if (notifications.length === 0) {
			throw new Error("Notification array cannot be empty.");
		}

		const validNotifications = notifications.map((notif) => {
			if (typeof notif !== 'object' || notif === null) {
				throw new Error("Notification must be an object.");
			}
			if (typeof notif.content !== 'object' || notif.content === null || typeof notif.content.text !== 'string') {
				throw new Error("Notification content must include a 'text' field of type string.");
			}
			if (!['alert', 'info', 'success'].includes(notif.type)) {
				notif.type = "info"; // Default to "info" if type is invalid
			}
			notif.read = typeof notif.read === 'boolean' ? notif.read : false; // Default read to false if not a boolean

			const allowedFields = ['type', 'content', 'read'];
			const unexpectedFields = Object.keys(notif).filter(key => !allowedFields.includes(key));
			if (unexpectedFields.length > 0) {
				throw new Error(`Unexpected field(s): ${unexpectedFields.join(', ')}`);
			}

			// Return formatted notification
			return {
				id: uuidv4(),
				type: notif.type,
				content: {
					text: notif.content.text,
				},
				timestamp: Date.now(),
				read: notif.read,
			};
		});

		const storedNotifications = JSON.parse(await env.NOTIFICATIONS_KV.get("notifications") || "[]");

		// Store the updated notifications list in KV storage
		await env.NOTIFICATIONS_KV.put("notifications", JSON.stringify([...storedNotifications, ...validNotifications]));

		return new Response(JSON.stringify(validNotifications), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(error.message || "Invalid request body", { status: 400 });
	}
}




// Function to retrieve notifications
async function retrieveNotifications(env) {
	const notifications = JSON.parse(await env.NOTIFICATIONS_KV.get("notifications") || "[]");
	return new Response(JSON.stringify(notifications), { status: 200, headers: { "Content-Type": "application/json" } });
}

// Function to delete all notifications
async function deleteAllNotifications(env) {
	await env.NOTIFICATIONS_KV.delete("notifications");
	return new Response(JSON.stringify({ message: "Notifications deleted successfully!" }), { status: 200, headers: { "Content-Type": "application/json" } });
}


// Function to set preferences cookie
async function setPreferencesCookie(request) {
	const preferences = {
		displayDuration: 5000,
		preferredTypes: ["alert", "info"],
	};

	const cookieValue = JSON.stringify(preferences);
	const cookieString = `preferences=${encodeURIComponent(cookieValue)}; Path=/api/notifications/cookie; Max-Age=2516100; HttpOnly`;

	const response = new Response(JSON.stringify(preferences), { status: 200, headers: { "Content-Type": "application/json" } });
	response.headers.set("Set-Cookie", cookieString);

	return response;
}

// Function to classify notification using Cloudflare Workers AI
async function classifyNotification(request, env) {
	const { text } = await request.json();

	const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
		prompt: `Classify the given notification text into one of these categories: finance, weather, health, or technology. The text will clearly belong to one of these categories. Respond with only the category name in lowercase.\n\nNotification text: "${text}"`,
	});

	return new Response(JSON.stringify({ category: aiResponse.response }), { status: 200, headers: { "Content-Type": "application/json" } });
}
