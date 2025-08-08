import { InkRunner, Utility, Processor } from "../inkrunner.js";

// unfortunately because codecs are kinda cooked, we need to lay out some ground rules
// 1. we can't tell what a file's codec is from the outside. audio makes this even worse. no audio. (just use audio tags!)
// 2. no i'm not going to crack open every video just to figure this stuff out
// 3. instead, we're going to associate specific codecs with specific containers
// 4. but because i'm nice, i'm going to give you ffmpeg commands to convert to these formats :)

// here are some ffmpeg commands i used in another project - these 4 should cover most browsers and platorms
// if you want to get silly with it, use https://github.com/pixop/video-compare to compare against your source

// AV1 Main Profile Level 5.1 Tier Main BitDepth 8 (https://trac.ffmpeg.org/wiki/Encode/AV1)
// ffmpeg -i VIDEO-IN -c:v libaom-av1 -b:v 0 -crf 40 -level 5.1 -pix_fmt yuv420p -cpu-used 1 -sn -an VIDEO-OUT.mp4

// VP9 Profile 0 Level 4.1 BitDepth 8 (https://trac.ffmpeg.org/wiki/Encode/VP9)
// ffmpeg -i VIDEO-IN -c:v libvpx-vp9 -b:v 0 -crf 44 -level 4.1 -pix_fmt yuv420p -cpu-used 0 -deadline best -sn -an VIDEO-OUT.webm

// HEVC Main Profile Compability 0 Level 4.1 Tier Main (https://trac.ffmpeg.org/wiki/Encode/H.265)
// ffmpeg -i VIDEO-IN -c:v libx265    -b:v 0 -crf 28 -level 4.1 -pix_fmt yuv420p -preset veryslow -tag:v hvc1 -sn -an VIDEO-OUT.mov

// AVC Main Profile Level 4.2 (https://trac.ffmpeg.org/wiki/Encode/H.264)
// ffmpeg -i VIDEO-IN -c:v libx264    -b:v 0 -crf 28 -level 4.2 -pix_fmt yuv420p -preset veryslow -sn -an VIDEO-OUT.m4v

// codecs are indexed by extension to make it easier
// codec strings are based on the above ffmpeg commands (i think they're right anyway)
// they're also sorted by priority, which is based on their usual file size (smaller = better)
const codecs = {
	mp4: {
		name: "AV1",
		extension: ".mp4",
		codecstring: 'video/mp4; codecs="av01.0.13M.08',
		priority: 1,
	},
	webm: {
		name: "VP9",
		extension: ".webm",
		codecstring: 'video/webm; codecs="vp09.00.41.08"',
		priority: 2,
	},
	mov: {
		name: "H265/HEVC",
		extension: ".mov",
		codecstring: 'video/quicktime; codecs="hev1.1.0.L123.b0"',
		priority: 3,
	},
	m4v: {
		name: "H264",
		extension: ".m4v",
		codecstring: 'video/mp4; codecs="avc1.4d002a"',
		priority: 4,
	},
};

let supportedCodecs = {};

addEventListener(
	"StoryActive",
	(event) => {
		const path = "video"; // from the root directory
		const extensions = [];

		// figure out supported codecs
		for (const key in codecs) {
			const vid = Utility.CreateElement("video", { dataset: { irRole: "video" } });
			if (vid.canPlayType(codecs[key].codecstring) === "probably") {
				supportedCodecs[key] = codecs[key];
				extensions.push(codecs[key].extension);
			}

			// if the browser says "probably" to one of them there's a good chance it'll be able to play it
			// just to be safe, we'll stop after we've got 2 supported codecs
			if (Object.keys(supportedCodecs).length === 2) break;
		}

		// tell inkrunner about them
		InkRunner.instance.AddTagType("video", {
			type: "video",
			path: path, // from the root directory
			extensions: extensions,
			tags: ["playVideo", "video"],
			ignoreStrings: ["play", "pause", "stop"],
			fileCheck: (file) => {
				return new Promise((resolve) => {
					let vid = Utility.CreateElement("video", { src: file.path, preload: true });
					vid.onloadeddata = () => {
						file.width = vid.videoWidth;
						file.height = vid.videoHeight;
						vid = null;
						resolve();
					};
				});
			},
		});

		// add processors
		event.detail.inkrunner.AddProcessor(video, playVideo, pauseVideo, stopVideo, stopAllVideo);
	},
	{ once: true }
);

// for saving/loading
const getVideoState = () => {
	let videoState = {};
	Object.keys(videos)
		.filter((key) => videos[key].element.isConnected === true)
		.forEach((key) => {
			Object.assign(videoState, {
				[key]: {
					playing: !videos[key].element.paused,
					time: videos[key].element.currentTime,
				},
			});
		});
	return videoState;
};

const setVideoState = (videoState) => {
	Object.keys(videoState).forEach((key) => {
		videos[key].element = document.getElementById(`vid-${key}`);
		videos[key].element.currentTime = videoState[key].time;
		if (videoState[key].playing) videos[key].element.play();
	});
};

// fetch preloaded videos
let videos = {};
addEventListener(
	"StoryLoaded",
	(event) => {
		// go through all the preloaded video files and create a local record of them
		const loadedVideoFiles = event.detail.inkrunner.externalFiles.filter((file) => file.type === "video");
		loadedVideoFiles.forEach((file) => {
			// let key = Utility.FilePathExtension(file.path).filename;
			let key = file.name;
			if (videos[key] === undefined) videos[key] = { paths: [], element: undefined };
			videos[key].width = file.width;
			videos[key].height = file.height;
			videos[key].paths.push(file.path);
		});

		// create video element with associated source elements for each video
		// i don't -think- this should be a problem as far as cpu/ram goes?
		// TODO: check if this is a problem
		Object.keys(videos).forEach((key) => {
			videos[key].element = Utility.CreateElement("video", {
				dataset: {
					irRole: "video",
					irName: key,
				},
				muted: true,
				preload: "auto", // technically this preloads the entire video :)
				disableremoteplayback: true,
				xWebkitAirplay: "deny",
				disablepictureinpicture: true,
				playsinline: true,
				width: videos[key].width,
				height: videos[key].height,
			});
			videos[key].paths.forEach((path) => {
				let source = Utility.CreateElement("source", { src: path, type: supportedCodecs[Utility.FilePathExtension(path).extension.substring(1)].codecstring });
				videos[key].element.append(source);
			});
		});
		// if the save/load processor is loaded, add the save/load callbacks
		InkRunner.instance.AddSaveLoadCallback?.("video", { save: getVideoState, load: setVideoState });
	},
	{ once: true }
);

const video = new Processor({
	name: "Video",
	author: "isyourguy",
	tag: "video",
	type: Processor.Type.Tag,
	stage: InkRunner.ProcessingStage.PreAppendText,
	defaultOptions: { loop: false, wait: false, remove: false },
	callback: async (params, inkrunner) => {
		// target is for play
		let target = params.tag.options.target !== undefined ? document.getElementById(params.tag.options.target) : inkrunner.currentContainer;

		// quick error checking
		if (params.tag.value.length < 1) {
			InkRunner.Warn(`#video: value needs at least one entries (i.e. #video: play videoName or #video stop)`, params.tag);
			return;
		}
		if (!(params.tag.value[0] === "play" || params.tag.value[0] === "pause" || params.tag.value[0] === "stop")) {
			InkRunner.Warn(`#video: value needs to begin with "play", "pause" or "stop" (i.e. #video: play ${params.tag.value[0]})`, params.tag);
			return;
		}

		const earlyReturnCheck = (options = { videoname: undefined, check: ["exists"], action: undefined }) => {
			if (options.check.includes("exists")) {
				if (!videos[options.videoname]) {
					InkRunner.Warn(`#video: Couldn't find video "${options.videoname}"`);
					return true;
				}
			}
			if (options.check.includes("isPlaying")) {
				if (videos[options.videoname].element.playing && videos[options.videoname].element.parentNode === target) {
					InkRunner.Warn(`#video: Video "${options.videoname}" already playing.`);
					return true;
				}
			}
			if (options.check.includes("isntPlaying")) {
				if (!videos[options.videoname].element.playing) {
					InkRunner.Warn(`#video: Tried to pause video "${options.videoname}" but it wasn't playing.`);
					return true;
				}
			}
			return false;
		};

		// commands are: play, pause, stop
		let commandArray = Utility.CommandArray(params.tag.value, ["play", "pause", "stop"]);
		let promises = [];

		commandArray.forEach((c) => {
			// stop all
			if (c.values.length === 0 && c.command === "stop") Object.keys(videos).forEach((videoname) => videos[videoname].element.remove());
			c.values.forEach((videoname) => {
				switch (c.command) {
					case "play":
						if (earlyReturnCheck({ videoname: videoname, check: ["exists", "isPlaying"] })) return;
						let video = videos[videoname].element;
						video.loop = params.tag.options.loop;
						video.currentTime = 0;
						video.id = "vid-" + videoname;
						target.append(video);
						video.play();
						if (params.tag.options.loop && (params.tag.options.wait || params.tag.options.remove)) {
							video.loop = false;
							InkRunner.Log(`#video: Tried to play video that waits or removes itself, but the video is set to loop. Removing loop.`);
						}
						if (params.tag.options.wait) {
							promises.push(
								new Promise((resolve) => {
									video.addEventListener(
										"ended",
										() => {
											if (params.tag.options.remove) video.remove();
											resolve();
										},
										{ once: true }
									);
								})
							);
						}
						break;
					case "pause":
						if (earlyReturnCheck({ videoname: videoname, check: ["exists", "isntPlaying"] })) return;
						videos[videoname].element.pause();
						break;
					case "stop":
						if (earlyReturnCheck({ videoname: videoname, check: ["exists"] })) return;
						videos[videoname].element.remove();
						break;
				}
			});
		});

		await Promise.all(promises);
		return;
	},
});

/**
 * plays video
 * #playVideo: video >> target:targetid, loop:true, wait:false, remove:false
 * target - the id of the target HTML element (defaults to current inkrunner container)
 * loop - loop the video (default true)
 * wait - waits until the video is finished before finishing the constructor
 * remove - removes the video when it's done
 */
const playVideo = new Processor({
	name: "Play video",
	author: "isyourguy",
	tag: "playVideo",
	type: Processor.Type.Tag,
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: async (params, inkrunner) => {
		params.tag.value.splice(0, 0, "play");
		return video.callback(params, inkrunner);
	},
});

/**
 * pauses video
 * #pauseVideo: video
 */
const pauseVideo = new Processor({
	name: "Pause video",
	author: "isyourguy",
	tag: "pauseVideo",
	type: Processor.Type.Tag,
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: async (params, inkrunner) => {
		params.tag.value.splice(0, 0, "pause");
		return video.callback(params, inkrunner);
	},
});

/**
 * stops video
 * #stopVideo: video
 */
const stopVideo = new Processor({
	name: "Stop video",
	author: "isyourguy",
	tag: "stopVideo",
	type: Processor.Type.Tag,
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: (params, inkrunner) => {
		params.tag.value.splice(0, 0, "stop");
		return video.callback(params, inkrunner);
	},
});

const stopAllVideo = new Processor({
	name: "Stop video",
	author: "isyourguy",
	tag: "stopAllVideo",
	type: Processor.Type.Tag,
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: (params, inkrunner) => {
		params.tag.value = ["stop"];
		return video.callback(params, inkrunner);
	},
});
