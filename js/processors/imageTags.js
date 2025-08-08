import { InkRunner, Utility, Processor } from "../inkrunner.js";

// TODO: change references of "story" to "inkrunner"
// the "story" is technically the inkjs object
// so naming the inkrunner instance "story" as well is a bit confusing
// also maybe rewrite the add image tag - it's a little messy

addEventListener(
	"StoryActive",
	(event) => {
		const path = "images";
		const extensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];

		// add default path, file extensions, and tags
		InkRunner.instance.AddTagType("image", {
			type: "image",
			path: path, // from the root directory
			extensions: extensions,
			tags: ["addImage", "image"],
			ignoreStrings: ["add", "remove"], // since the syntax is #image: add img.png
			fileCheck: (file) => {
				return new Promise((resolve) => {
					let img = new Image();
					img.src = file.path;
					img.onload = () => {
						file.width = img.width;
						file.height = img.height;
						img = null;
						resolve();
					};
				});
			},
		});

		// add processors
		InkRunner.instance.AddProcessor(image, addImage, removeImage, removeAllImages);
	},
	{ once: true }
);

const image = new Processor({
	name: "Add/remove image",
	author: "isyourguy",
	description: "Adds and removes images from the document",
	tag: "image",
	type: Processor.Type.Tag,
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: (params, inkrunner) => {
		// get target (find or use container)
		let target = params.tag.options.target !== undefined ? document.getElementById(params.tag.options.target) : inkrunner.currentContainer;
		if (!target) {
			InkRunner.Warn(`#image: couldn't find element with id "${params.tag.options.target}". Using story container.`);
			target = inkrunner.currentContainer;
		}

		// quick error checking
		if (params.tag.value.length < 1) {
			InkRunner.Warn(`#image: value needs at least one entries (i.e. #image: add imageNameOrPath or #image: remove)`, params.tag);
			return;
		}
		if (!(params.tag.value[0] === "add" || params.tag.value[0] === "remove")) {
			InkRunner.Warn(`#image: value needs to begin with "add" or "remove" (i.e. #image: add ${params.tag.value[0]})`, params.tag);
			return;
		}

		// split files into add/remove arrays
		let commandArray = Utility.CommandArray(params.tag.value, ["add", "remove"]);
		let addedElements = [];
		commandArray.forEach((c) => {
			if (c.values.length === 0 && c.command === "remove") {
				target.querySelectorAll(`img[data-ir-role="image"]`).forEach((e) => e.remove());
			}
			c.values.forEach((v) => {
				switch (c.command) {
					case "add":
						let file = inkrunner.externalFiles.find((file) => file.name === Utility.FilePathExtension(v).path + Utility.FilePathExtension(v).filename && file.type === "image");
						if (!file) {
							InkRunner.Warn(`#image: could not find image "${v}"`);
							return;
						}
						let element = document.querySelector(`img[data-ir-role="image"][data-ir-name="${file.name}"]`);
						if (!element) element = Utility.CreateElement("img", { id: "img-" + file.name, src: file.path, dataset: { irRole: "image", irName: file.name } });
						addedElements.push(element);
						break;
					case "remove":
						document.querySelector(`img[data-ir-role="image"][data-ir-name="${Utility.FilePathExtension(v).filename}"]`)?.remove();
						break;
				}
			});
		});

		target.append(...addedElements);
		if (addedElements.length > 0) params.target = addedElements;
	},
});

/**
 * adds an image to the target (or the story container)
 * #addImage: path or name >> target:targetid
 * to add classes, use the class & classAfter options
 */
const addImage = new Processor({
	name: "Add Image",
	author: "isyourguy",
	description: "Adds image to the document",
	tag: "addImage",
	type: Processor.Type.Tag,
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: (params, inkrunner) => {
		params.tag.value.splice(0, 0, "add");
		return image.callback(params, inkrunner);
	},
});

/**
 * removes image
 * #removeImage: path or name (supplied by addImage)
 */
const removeImage = new Processor({
	name: "Remove Image",
	author: "isyourguy",
	description: "Removes image from the document",
	tag: "removeImage",
	type: Processor.Type.Tag,
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: (params, inkrunner) => {
		params.tag.value.splice(0, 0, "remove");
		return image.callback(params, inkrunner);
	},
});

/**
 * remove all images
 * #removeAllImages >> target:targetid
 */
const removeAllImages = new Processor({
	name: "Remove All Images",
	author: "isyourguy",
	description: "Removes all images added by addImage tag from the target (or body if blank)",
	tag: "removeAllImages",
	type: Processor.Type.Tag,
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: (params, inkrunner) => {
		params.tag.value = ["remove"];
		return image.callback(params, inkrunner);
	},
});
