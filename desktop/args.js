"use strict";

// Build the argument list for `python -m inference.realtime --live`.
// parseDevices reads the text table printed by --list-devices.
// Running this file directly checks both against fixed examples.

const F0 = new Set(["rmvpe", "fcpe", "pm"]);

const NUMBERS = [
	["key", "--key"],
	["formant", "--formant"],
	["indexRate", "--index-rate"],
	["sampleRate", "--sample-rate"],
	["blockTime", "--block-time"],
	["crossfadeTime", "--crossfade-time"],
	["extraTime", "--extra-time"],
	["rmsMixRate", "--rms-mix-rate"],
	["inputChannels", "--input-channels"],
	["outputChannels", "--output-channels"],
	["inputGain", "--input-gain"],
	["outputGain", "--output-gain"],
	["f0Min", "--f0-min"],
	["f0Max", "--f0-max"],
	["rmvpeThreshold", "--rmvpe-threshold"],
	["fcpeThreshold", "--fcpe-threshold"],
	["indexNeighbors", "--index-neighbors"],
];

// opts uses the page's field names. Empty optional strings are left off the command.
function buildArgs(opts) {
	if (!opts || !opts.model) throw new Error("Model is required");
	if (!F0.has(opts.f0)) throw new Error("Pitch method must be rmvpe, fcpe, or pm");
	const latency = opts.latency == null ? "" : String(opts.latency).trim();
	if (latency && latency !== "low" && latency !== "high" && !Number.isFinite(Number(latency))) {
		throw new Error("Latency must be low, high, or seconds");
	}
	const numbers = {};
	for (const [key, flag] of NUMBERS) {
		const value = Number(opts[key]);
		if (!Number.isFinite(value)) throw new Error(`${flag} must be a number`);
		numbers[key] = value;
	}
	if (numbers.f0Min <= 0 || numbers.f0Max <= numbers.f0Min) {
		throw new Error("Lowest pitch must be above 0 and below the highest pitch");
	}
	if (numbers.inputChannels < 1 || numbers.outputChannels < 1) {
		throw new Error("Channel counts must be at least 1");
	}
	if (numbers.indexNeighbors < 1) throw new Error("Index neighbors must be at least 1");

	const args = ["-m", "inference.realtime", "--live", "--model", String(opts.model), "--f0", opts.f0];
	if (opts.index) args.push("--index", String(opts.index));
	if (opts.inputDevice) args.push("--input-device", String(opts.inputDevice));
	if (opts.outputDevice) args.push("--output-device", String(opts.outputDevice));
	if (opts.hostApi) args.push("--host-api", String(opts.hostApi).trim());
	if (latency) args.push("--latency", latency);
	for (const [key, flag] of NUMBERS) args.push(flag, String(numbers[key]));
	if (opts.noClip) args.push("--no-clip");
	if (opts.wasapiExclusive) args.push("--wasapi-exclusive");
	if (opts.wasapiAutoConvert) args.push("--wasapi-auto-convert");
	return args;
}

// Device names can wrap onto the next line. Join those before matching columns.
function parseDevices(text) {
	const devices = [];
	const merged = [];
	for (const line of String(text).split(/\r?\n/)) {
		if (/^\s*\d+\s+\d+\s+\d+\s+\d+\s+/.test(line) || merged.length === 0) merged.push(line);
		else merged[merged.length - 1] += line;
	}
	for (const line of merged) {
		const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
		if (!match) continue;
		const parts = match[5].split(/\s{2,}/);
		if (parts.length < 2) continue;
		devices.push({
			index: Number(match[1]),
			inputs: Number(match[2]),
			outputs: Number(match[3]),
			rate: Number(match[4]),
			host: parts[0].trim(),
			name: parts[1].trim(),
			note: parts.slice(2).join(" ").replace(/[()]/g, "").trim(),
		});
	}
	return devices;
}

// Rebuild one row of the device table. Used only by the self-check below.
function formatDeviceLine(index, inputs, outputs, rate, host, name, note) {
	const hostField = host.length < 18 ? host.padEnd(18, " ") : host;
	const suffix = note ? `  (${note})` : "";
	return `${String(index).padStart(4, " ")}  ${String(inputs).padStart(3, " ")}  ${String(outputs).padStart(3, " ")}  ${String(rate).padStart(8, " ")}  ${hostField}  ${name}${suffix}`;
}

function check(cond, message) {
	if (!cond) throw new Error(message);
}

if (require.main === module) {
	const base = {
		model: "assets/weights/kikiV1.pth",
		index: "",
		f0: "rmvpe",
		key: 0,
		formant: 0,
		indexRate: 0.75,
		sampleRate: 0,
		blockTime: 0.25,
		crossfadeTime: 0.05,
		extraTime: 2.5,
		rmsMixRate: 0,
		inputDevice: "",
		outputDevice: "",
		hostApi: "",
		inputChannels: 1,
		outputChannels: 2,
		latency: "",
		inputGain: 1,
		outputGain: 1,
		noClip: false,
		wasapiExclusive: false,
		wasapiAutoConvert: false,
		f0Min: 50,
		f0Max: 1100,
		rmvpeThreshold: 0.03,
		fcpeThreshold: 0.006,
		indexNeighbors: 8,
	};
	const args = buildArgs(base);
	check(args[0] === "-m" && args.includes("--live") && args.includes("--f0"));
	check(!args.includes("--index") && !args.includes("--no-clip") && !args.includes("--input-device"));
	check(args[args.indexOf("--block-time") + 1] === "0.25");

	const flagged = buildArgs({
		...base,
		index: "voice.index",
		inputDevice: "1",
		outputDevice: "2",
		hostApi: "WASAPI",
		latency: "low",
		noClip: true,
		wasapiExclusive: true,
	});
	for (const flag of ["--index", "--input-device", "--host-api", "--latency", "--no-clip", "--wasapi-exclusive"]) {
		check(flagged.includes(flag), flag);
	}

	function message(fn) {
		try {
			fn();
		} catch (error) {
			return error.message;
		}
		return "";
	}
	check(message(() => buildArgs({ ...base, model: "" })) === "Model is required");
	check(message(() => buildArgs({ ...base, f0: "nope" })).includes("Pitch method"));
	check(message(() => buildArgs({ ...base, f0Min: 80, f0Max: 40 })).includes("Lowest pitch"));
	check(message(() => buildArgs({ ...base, latency: "fast" })).includes("Latency"));
	check(message(() => buildArgs({ ...base, indexNeighbors: 0 })).includes("neighbors"));

	const table = [
		" idx   in  out      rate  host                name",
		formatDeviceLine(0, 2, 0, 48000, "Windows WASAPI", "Microphone (Realtek)", "default input"),
		formatDeviceLine(1, 0, 2, 48000, "Windows DirectSound", "Speakers", "default output"),
		"",
	].join("\n");
	const devices = parseDevices(table);
	check(devices.length === 2, "header skipped");
	check(devices[0].inputs === 2 && devices[0].name === "Microphone (Realtek)" && devices[0].host === "Windows WASAPI");
	check(devices[1].outputs === 2 && devices[1].host === "Windows DirectSound" && devices[1].note === "default output");
	const wrapped = parseDevices(`${formatDeviceLine(4, 1, 0, 8000, "Windows WDM-KS", "Headset (SOUNDPEATS", "")}\nGamer)\n`);
	check(wrapped.length === 1 && wrapped[0].name.includes("Gamer"), "wrapped device name");
	console.log("args ok");
}

module.exports = { buildArgs, parseDevices };
