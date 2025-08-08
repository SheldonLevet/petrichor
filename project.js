import { InkLoader } from "./js/inkloader.js";

// put the path to your ink file right here
// if your story has includes, just use the main one!
const storyPath = "./ink/story.ink";

// this is all the processors i've written so far
// only load the ones you're actually using (otherwise you're wasting bandwidth)
// you can comment out the ones you're not using by putting two forward slashes in front of them
// <- like this!
const processorPaths = [
	"./js/processors/defaultTags.js",
	"./js/processors/textWrapper.js",
	"./js/processors/imageTags.js",
	"./js/processors/audioTags.js",
	"./js/processors/continueMarker.js",
	"./js/processors/textAnimation.js",
	// "./js/processors/videoTags.js",
	// "./js/processors/spanner.js",
	// "./js/processors/inkVariableToCss.js",
];

// if you want to preload files other than the ones in your ink script you can put them here
// put the file paths to them in double quotes inside the square brackets separated by commas
// e.g. ["./images/file1.png","./images/files2.png"]
// if you're adding images, video, or sound through their tags, they'll be preloaded automatically
const externalFiles = ["./fonts/Veljovic-Black.woff2"];

// you won't need to change these unless you want some extra debug messages.
// if you want debug messages, uncomment the debug line
// if you want lots of messages, uncomment both the debug and verbose lines
// make sure to comment them out again when you publish your story!
const inkrunnerOptions = {
	inkPath: "./js/ink-full.js",
	debug: true,
	verbose: true,
};

// this is the inkloader setup stuff
// probably don't modify this unless you know what you're doing
let InkRunner, Utility;
const inkrunner = await new InkLoader(storyPath, inkrunnerOptions, processorPaths, externalFiles).Load();
({ InkRunner: InkRunner, Utility: Utility } = await import("./js/inkrunner.js"));

await Start();

async function Start() {
	// continues the story on click
	inkrunner.AddTrigger("continue", { listener: "click" });
	// continues the story on spacebar
	inkrunner.AddTrigger("continue", { listener: "keydown", key: " "});

	await inkrunner.Continue();
}
