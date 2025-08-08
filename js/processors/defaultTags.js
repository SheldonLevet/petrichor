import { InkRunner, Utility, Processor, PassageObject } from "../inkrunner.js";

addEventListener(
	"StoryActive",
	(event) => {
		InkRunner.instance.AddProcessor(delay, continueOnce, continueUntil);
		InkRunner.instance.AddProcessor(classProcessor, classAdd, classRemove);
		InkRunner.instance.AddProcessor(clear, container, addContainer, setContainer, removeContainer);
		InkRunner.instance.AddProcessor(addTextBox, setTextBox, removeTextBox, textBox, hideTextBox);
		InkRunner.instance.AddProcessor(resetStory, callSVGAnimate);
		InkRunner.instance.AddProcessor(blank);
	},
	{ once: true }
);

// see README for more info
const processorTemplate = new Processor({
	name: "template",
	author: "",
	description: "",
	tag: "template", // mandatory if type is tag
	type: Processor.Type.Tag, // defaults to tag
	stage: InkRunner.ProcessingStage.PreAppendText, // mandatory for all processors
	priority: 0, // defaults to 0, can use -Infinity and Infinity (but be careful!)
	defaultOptions: {},
	defaultActions: { delay: true, class: true },
	callback: async (params) => {},
});

/**
 * blank tag that allows for delays, adding/removing classes to targets, setting CSS variables, etc.
 * if target is blank, it defaults to document root
 * #blank >> postDelayTime:1000, postClass: add classname, cssVar:50%
 */
const blank = new Processor({
	name: "Blank",
	author: "isyourguy",
	description: "Tag that doesn't do anything",
	tag: "blank",
	stage: InkRunner.ProcessingStage.PreAppendText,
	priority: Infinity,
	callback: async (params) => {},
});

/**
 * delays the sequential processor promise chain
 * #delay: 1000 >> skippable:false
 */
const delay = new Processor({
	name: "Delay",
	author: "isyourguy",
	description: "Delays the processor chain. Can be skipped!",
	tag: "delay",
	stage: InkRunner.ProcessingStage.PreAppendText,
	defaultOptions: { skippable: false },
	callback: async (params) => {
		if (!params.tag.value) return;
		await Utility.Delay(params.tag.value[0], { skippable: params.tag.options.skippable });
	},
});

/**
 * Resets the ink story state when the next Continue function completes
 * #resetStory
 */
const resetStory = new Processor({
	name: "Reset Story",
	author: "isyourguy",
	description: "Resets the ink story state when the Continue function completes",
	tag: "resetStory",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params) => addEventListener("ContinueComplete", InkRunner.instance.ResetStory, { once: true }),
});

//#region continue

/**
 * continues the story once (best used immediately after a line of text or a choice with output text)
 * #continue
 */
const continueOnce = new Processor({
	name: "Continue",
	author: "isyourguy",
	description: "Continues when next able",
	tag: "continue",
	stage: InkRunner.ProcessingStage.Final,
	priority: -Infinity, //last
	callback: async () => {
		InkRunner.instance.SetContinueBlock(true);
		addEventListener(
			"ContinueComplete",
			(event) => {
				if (event.detail.choiceCount > 0) return;
				InkRunner.instance.Continue(true);
				InkRunner.instance.SetContinueBlock(false);
			},
			{ once: true }
		);
	},
});

/**
 * continues the story automatically until a choice, the story ends, or a corresponding "#continueUntil >> stop" tag
 * calling again without stopping allows you to change the delay between continues
 * #continueUntil >> delayTime:3000, delaySkippable:true
 */
let cuController = new AbortController(); // keeping the AbortController above the callback scope
const continueUntil = new Processor({
	name: "Continue Until",
	author: "isyourguy",
	description: 'Continues until it hits a corresponding "#continueUntil: stop" tag',
	tag: "continueUntil",
	stage: InkRunner.ProcessingStage.Final,
	priority: -Infinity, // last
	defaultOptions: { delayTime: 1000, delaySkippable: false },
	defaultActions: { delay: false },
	callback: async (params) => {
		const cont = async (event) => {
			if (event.detail.choiceCount > 0 || event.detail.textCount === 0 || InkRunner.instance.currentStatus === InkRunner.Status.Error) {
				remove();
				return;
			}
			InkRunner.instance.SetContinueBlock(true);
			await Utility.Delay(params.tag.options.delayTime, { skippable: params.tag.options.delaySkippable });
			InkRunner.instance.Continue(true);
		};
		const remove = () => {
			InkRunner.instance.SetContinueBlock(false);
			cuController.abort();
			cuController = new AbortController();
		};

		remove();

		// early return if we've hit "continueUntil: stop"
		if (params.tag.value && params.tag.value[0].toLowerCase() === "stop") {
			remove();
			return;
		}

		addEventListener("ContinueComplete", async (event) => await cont(event), { signal: cuController.signal });
		addEventListener("StoryEnded", remove, { once: true, signal: cuController.signal });
	},
});

//#endregion

//#region classes

/**
 * adds or removes classes to the current text line or target id
 * #class: add class1 class2 remove class3 >> target:targetid
 */
const classProcessor = new Processor({
	name: "CSS Class",
	author: "isyourguy",
	tag: "class",
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: async (params) => {
		if (!params.tag.value) return;
		if (!params.target) return;
		if (params.tag.value.length <= 1) {
			InkRunner.Warn(`#class: value needs at least two entries (i.e. #class: add classname)`, params.tag);
			return;
		}
		if (!(params.tag.value[0] === "add" || params.tag.value[0] === "remove")) {
			InkRunner.Warn(`#class: value needs to begin with "add" or "remove" (i.e. #class: add ${valueArray[0]})`, params.tag);
			return;
		}

		let commandArray = Utility.CommandArray(params.tag.value, ["add", "remove"]);
		commandArray.forEach((c) => {
			// remove all
			if (c.values.length === 0 && c.command === "remove") {
				params.target.forEach((t) => t.removeAttribute("class"));
				return;
			}
			switch (c.command) {
				case "add":
					params.target.forEach((t) => t.classList.add(...c.values));
					break;
				case "remove":
					params.target.forEach((t) => t.classList.remove(...c.values));
					break;
			}
		});
	},
});

const classAdd = new Processor({
	name: "Add CSS Class",
	author: "isyourguy",
	tag: "addClass",
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: async (params, inkrunner) => {
		params.tag.value.splice(0, 0, "add");
		return classProcessor.callback(params, inkrunner);
	},
});

const classRemove = new Processor({
	name: "Add CSS Class",
	author: "isyourguy",
	tag: "removeClass",
	stage: InkRunner.ProcessingStage.PreAppendText,
	callback: async (params, inkrunner) => {
		params.tag.value.splice(0, 0, "remove");
		return classProcessor.callback(params, inkrunner);
	},
});

//#endregion

//#region containers

/**
 * removes all elements from a container (defaults to current active)
 * e.g. #clear: containerids
 */
const clear = new Processor({
	name: "Clear",
	author: "isyourguy",
	description: "Removes all elements in the current container",
	tag: "clear",
	stage: InkRunner.ProcessingStage.RawData,
	priority: 0, // might need to modify this later...
	callback: async (params) => {
		if (!params.tag.value) {
			InkRunner.instance.currentContainer.innerHTML = "";
			return;
		}
		params.tag.value.forEach((id) => {
			let container = document.getElementById(id);
			if (!container) InkRunner.Warn(`#clear: Couldn't find container with id "${id}"`, params.tag);
			if (container) container.innerHTML = "";
		});
	},
});

/**
 * adds/sets/removes containers
 * e.g. #container: add new1 new2 set new1 remove old >> parent:parentid
 * needs add/set/remove keywords. they occur in the order they appear
 */
const container = new Processor({
	name: "Add/Set/Remove container",
	author: "isyourguy",
	description: "Adds/sets/removes the current story container",
	tag: "container",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		if (!params.tag.value) {
			InkRunner.Warn(`#container: no value provided`, params.tag);
			return;
		}
		if (params.tag.value.length < 1) {
			InkRunner.Warn(`#container: value needs at least one entry (i.e. #container: add containername or #container: remove)`, params.tag);
			return;
		}
		if (!(params.tag.value[0] === "add" || params.tag.value[0] === "set" || params.tag.value[0] === "remove")) {
			InkRunner.Warn(`#container: value needs to begin with "add", "set" or "remove" (i.e. #container: add ${params.tag.value[0]})`, params.tag);
			return;
		}
		// let parent = params.tag.options.parent ? document.getElementById(params.tag.options.parent) : document.body;
		let parent = params.tag.options.target ? (params.target ? params.target[0] : document.body) : document.body;
		if (!params.tag.options.target || !params.target) InkRunner.Log(`#container: no target set. Using document.body instead."`, params.tag);

		let commandArray = Utility.CommandArray(params.tag.value, ["add", "set", "remove"]);
		let addedContainers = [];
		let setContainer = undefined;
		commandArray.forEach((c) => {
			/// remove all
			if (c.values.length === 0 && c.command === "remove") {
				let defaultid = inkrunner.defaultContainer.id;
				Array.from(parent.querySelectorAll(`[data-ir-role="container"]`))
					.filter((c) => c.id !== defaultid)
					.forEach((c) => c.remove());
				inkrunner.ResetContainer();
			}
			if (c.values.length > 1 && c.command === "set") InkRunner.Log(`#container: setting more than one container is kind of pointless. Using the last container specified.`);
			c.values.forEach((containerid) => {
				switch (c.command) {
					case "add":
						if (document.getElementById(containerid)) {
							InkRunner.Warn(`#container: tried to add container that already exists.`, params.tag);
							return;
						}
						let element = Utility.CreateElement("div", { id: containerid, dataset: { irRole: "container", irActive: false } });
						parent.append(element);
						addedContainers.push(element);
						break;
					case "set":
						if (!document.getElementById(containerid)) {
							InkRunner.Warn(`#container: tried to set container that doesn't exist.`, params.tag);
							return;
						}
						inkrunner.SetContainer(document.getElementById(containerid));
						setContainer = document.getElementById(containerid);
						break;
					case "remove":
						if (!document.getElementById(containerid)) {
							InkRunner.Warn(`#container: tried to remove container that doesn't exist.`, params.tag);
							return;
						}
						if (inkrunner.currentContainer.id === containerid) inkrunner.ResetContainer();
						if (containerid !== inkrunner.defaultContainer.id) document.getElementById(containerid)?.remove();
						break;
				}
			});
		});
		if (addedContainers.length > 0) params.target = addedContainers;
		if (setContainer === 0) params.target = [setContainer];
	},
});

// aliases

// addContainer
const addContainer = new Processor({
	name: "Add container",
	author: "isyourguy",
	tag: "addContainer",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		params.tag.value.splice(0, 0, "add");
		return container.callback(params, inkrunner);
	},
});
// setContainer (adds if it doesn't exist)
const setContainer = new Processor({
	name: "Set container",
	author: "isyourguy",
	tag: "setContainer",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		params.tag.value = ["add", ...params.tag.value, "set", ...params.tag.value];
		return container.callback(params, inkrunner);
	},
});
// removeContainer
const removeContainer = new Processor({
	name: "Remove container",
	author: "isyourguy",
	tag: "removeContainer",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		params.tag.value.splice(0, 0, "remove");
		return container.callback(params, inkrunner);
	},
});

//#endregion

/**
 * adds/sets/removes containers
 * e.g. #container: add new1 new2 set new1 remove old >> parent:parentid
 * needs add/set/remove keywords. they occur in the order they appear
 */
const textBox = new Processor({
	name: "Add/Set/Remove textbox",
	author: "chaos_fungorium",
	description: "Adds/sets/removes custom text boxes",
	tag: "textbox",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		if (!params.tag.value) {
			InkRunner.Warn(`#textbox: no value provided`, params.tag);
			return;
		}
		if (params.tag.value.length < 1) {
			InkRunner.Warn(`#textbox: value needs at least one entry (i.e. #textbox: add textboxname or #textbox: remove)`, params.tag);
			return;
		}
		if (!(params.tag.value[0] === "add" || params.tag.value[0] === "set" || params.tag.value[0] === "remove")) {
			InkRunner.Warn(`#textbox: value needs to begin with "add", "set" or "remove" (i.e. #textbox: add ${params.tag.value[0]})`, params.tag);
			return;
		}
		// let parent = params.tag.options.parent ? document.getElementById(params.tag.options.parent) : document.body;
		let parent = params.tag.options.target ? (params.target ? params.target[0] : document.body) : document.body;
		if (!params.tag.options.target || !params.target) InkRunner.Log(`#textbox: no target set. Using document.body instead."`, params.tag);

		let commandArray = Utility.CommandArray(params.tag.value, ["add", "set", "remove"]);
		let addedTextboxes = [];
		let setContainer = undefined;
		commandArray.forEach((c) => {
			/// remove all
			if (c.values.length === 0 && c.command === "remove") {
				Array.from(parent.querySelectorAll(`[data-ir-role="textbox"]`))
					.forEach((c) => c.remove());
			}

			c.values.forEach((textboxid) => {
				switch (c.command) {
					case "add":
						if (document.getElementById(textboxid)) {
							InkRunner.Warn(`#textbox: tried to add textbox that already exists.`, params.tag);
							return;
						}

						let topElement = Utility.CreateElement("div", { id: textboxid, dataset: { irRole: "textbox", irActive: false } });
						let para = Utility.CreateElement("p", { class: "text" });
						let blender = Utility.CreateElement("div", { class: "blender"});
						topElement.append(blender);
						topElement.append(para);
						parent.append(topElement);
						addedTextboxes.push(topElement);
						break;
					case "set":
						if (!document.getElementById(params.tag.options.target)) {
							InkRunner.Warn(`#textbox: tried to set textbox that doesn't exist.`, params.tag);
							return;
						}
						let box = document.getElementById(params.tag.options.target);
						box.childNodes[1].innerHTML = params.tag.text;

						if (params.tag.text.length > 0) {
							box.classList.add("show");
						} else {
							box.classList.remove("show");
						}
						break;
					case "hide":
						if (!document.getElementById(params.tag.options.target)) {
							InkRunner.Warn(`#textbox: tried to set textbox that doesn't exist.`, params.tag);
							return;
						}
						let _box = document.getElementById(params.tag.options.target);
						_box.classList.remove("show");
						break;
					case "remove":
						if (!document.getElementById(textboxid)) {
							InkRunner.Warn(`#textbox: tried to remove container that doesn't exist.`, params.tag);
							return;
						}
						document.getElementById(textboxid)?.remove();
						break;
				}
			});
		});
	},
});

// addTextBox
const addTextBox = new Processor({
	name: "Add textbox",
	author: "chaos_fungorium",
	tag: "addTextBox",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		params.tag.value.splice(0, 0, "add");
		return textBox.callback(params, inkrunner);
	},
});
// setContainer (adds if it doesn't exist)
const setTextBox = new Processor({
	name: "Set textbox",
	author: "chaos_fungorium",
	tag: "setTextBox",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		params.tag.text = params.tag.value.join(" ");
		params.tag.value = ["set", ...params.tag.value];
		return textBox.callback(params, inkrunner);
	},
});
// hideContainer (adds if it doesn't exist)
const hideTextBox = new Processor({
	name: "Set textbox",
	author: "chaos_fungorium",
	tag: "hideTextBox",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		params.tag.value = ["hide"];
		return textBox.callback(params, inkrunner);
	},
});
// removeContainer
const removeTextBox = new Processor({
	name: "Remove container",
	author: "chaos_fungorium",
	tag: "removeTextBox",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		params.tag.value.splice(0, 0, "remove");
		return textBox.callback(params, inkrunner);
	},
});
const callSVGAnimate = new Processor({
	name: "Call SVG Animate",
	author: "chaos_fungorium",
	tag: "callSVGAnimate",
	stage: InkRunner.ProcessingStage.RawData,
	callback: async (params, inkrunner) => {
		if (!params.tag.value) {
			InkRunner.Warn(`#callSVGAnimate: no value provided`, params.tag);
			return;
		}
		if (params.tag.value.length < 1) {
			InkRunner.Warn(`#callSVGAnimate: value needs at least one entry (i.e. #callSVGAnimate: targetid)`, params.tag);
			return;
		}
		document.getElementById(params.tag.value[0]).classList.add("show");
		var select = function(s){return document.querySelector(s); },
		selectAll = function(s){return document.querySelectorAll(s);},
    ring = select('#ring'),
    allLines = selectAll('#lines line');

		window.gsap.set(allLines, {
  		drawSVG: '40% 80%'
		})

		var tl = window.gsap.timeline({repeat:-1, repeatDelay:1});
		tl.to(allLines, 0.5, {
      drawSVG: '40% 70%',
      ease: Linear.easeNone
 		})
		.to(allLines, 0.5, {
  		drawSVG: '100% 100%',
      ease: Linear.easeNone
		})

		.fromTo(ring, 1, {
  		attr: {
    		rx:0,
    		ry:0 
  		}
  	},{
  		attr:{
    		ry:22
			}
		})
		.to(ring, .8, {
  		attr:{
    		rx:22
  		}
		})

		setTimeout(() => {
			document.getElementById(params.tag.value[0]).classList.remove("show");
			tl.kill();
		}, 3000);
	}
})