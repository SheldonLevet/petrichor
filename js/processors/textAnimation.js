import { InkRunner, Utility, Processor } from "../inkrunner.js";

window.addEventListener(
	"StoryActive",
	(event) => {
		InkRunner.instance.RemoveProcessor(InkRunner.instance.defaultAppendText);
		InkRunner.instance.RemoveProcessor(InkRunner.instance.defaultAppendChoice);
		InkRunner.instance.AddProcessor(textAnimation);
		InkRunner.instance.AddProcessor(choiceAnimation);
		InkRunner.instance.AddProcessor(changeAnimation);
	},
	{ once: true }
);

// the thing what stores all the animations
const animationMap = new Map();
let currentTextAnimation;
let currentChoiceAnimation;

// if you want to define your own token offsets or groups of offsets, you can do it here
const tokenOffsets = {
	default: {
		" ": { delayOffset: -1000.0, animationOffset: -1000.0 },
		".": { delayOffset: 800.0 },
		"!": { delayOffset: 800.0 },
		"?": { delayOffset: 800.0 },
		";": { delayOffset: 650.0 },
		",": { delayOffset: 550.0 },
		"—": { delayOffset: 550.0 },
	},
};

// define any custom matches/bounds here (regex must be global)
const customMatches = {
	// word: /.+?(\b|$)[^\w]*/g,
};

const customBounds = {
	// word: /(\b|^).+?(\b|$)[^\w]*/g,
};

window.addEventListener(
	"StoryLoaded",
	(event) => {
		let noAnimation = new Animation();
		noAnimation.skipEvent = undefined;
		animationMap.set("none", noAnimation);
		currentTextAnimation = noAnimation;
		currentChoiceAnimation = noAnimation;
	},
	{ once: true }
);

const textAnimation = new Processor({
	name: "Text animation",
	type: Processor.Type.TextElement,
	stage: InkRunner.ProcessingStage.AppendText,
	priority: -Infinity,
	callback: async (params, inkrunner) => {
		inkrunner.currentContainer.append(...params.target);
		await currentTextAnimation.Animate(params.target);
	},
});

const choiceAnimation = new Processor({
	name: "Choice animation",
	type: Processor.Type.ChoiceElement,
	stage: InkRunner.ProcessingStage.AppendChoices,
	priority: -Infinity,
	callback: async (params, inkrunner) => {
		inkrunner.currentContainer.append(...params.target);
		params.target.forEach((e) => (e.style.pointerEvents = "none"));
		await currentChoiceAnimation.Animate(params.target);
		params.target.forEach((e) => (e.style.pointerEvents = "unset"));
	},
});

// TODO: this is messy... need to tidy this up. too many weird cases handled by "if if if"

const changeAnimation = new Processor({
	name: "Change text/choice animation",
	type: Processor.Type.Tag,
	tag: "textAnimation",
	stage: InkRunner.ProcessingStage.PreAppendText,
	defaultOptions: {
		mode: undefined,
		delay: 0.0,
		length: 0.0,
		classes: undefined,
		removeClasses: false,
		tokenOffsets: undefined,
		match: undefined,
		bounds: undefined,
	},
	callback: (params, inkrunner, processor) => {
		// compares the tag options and the default options (if these are the same, assume no options were provided)
		let noOptions = Utility.ObjectEqualityDeep(params.tag.options, processor.defaultOptions);

		// if no value or options, unset both animations
		if (!params.tag.value && noOptions) {
			currentTextAnimation = animationMap.get("none");
			currentChoiceAnimation = animationMap.get("none");
			return;
		}

		// if the first element of the value isn't a command, append the "text" command
		let animCommands = ["text", "choice", "all"];
		if (params.tag.value && !animCommands.includes(params.tag.value?.[0])) params.tag.value.unshift("text");
		let animCommand = Utility.CommandArray(params.tag.value, animCommands)[0];
		let animName = animCommand.values[0];

		// if there's no anim and no options, unset that animation
		if (!animName && noOptions) {
			if (animCommand.command === "text" || animCommand.command === "all") currentTextAnimation = animationMap.get("none");
			if (animCommand.command === "choice" || animCommand.command === "all") currentChoiceAnimation = animationMap.get("none");
			return;
		}

		let anim = animationMap.get(animName);

		// if no value set, use current anim
		if (!animName) {
			if (animCommand.command === "text") anim = currentTextAnimation;
			if (animCommand.command === "choice") anim = currentChoiceAnimation;
			if (!anim) {
				InkRunner.Error(`#textAnimation: Tried to create new animation with no name or set options on both text and choice animations.`);
				return;
			}
		}

		if (anim === animationMap.get("none")) {
			InkRunner.Warn(`#textAnimation: Tried to change options on the reserved "none" animation. Don't do this!`);
			return;
		}

		/* OPTIONS */
		if (params.tag.options.mode) params.tag.options.mode = Animation?.Mode[params.tag.options.mode[0].toUpperCase() + params.tag.options.mode.slice(1).toLowerCase()] || undefined;
		params.tag.options.classes = params.tag.options.classes?.split(" ") || undefined;
		params.tag.options.tokenOffsets = tokenOffsets[params.tag.options?.tokenOffsets] || undefined;
		if (!params.tag.options.mode) delete params.tag.options.mode;
		if (!params.tag.options.classes) delete params.tag.options.classes;
		if (!params.tag.options.tokenOffsets) delete params.tag.options.tokenOffsets;
		if (!params.tag.options.removeClasses) delete params.tag.options.removeClasses;
		/* OPTIONS END */

		if (anim) {
			// set anim and update options (if set)
			if (!noOptions) anim.SetOptions(params.tag.options);
		} else {
			// create new animation
			anim = new ClassAnimation();
			anim.SetOptions(params.tag.options);
			animationMap.set(animName, anim);
		}

		if (animCommand.command === "text" || animCommand.command === "all") currentTextAnimation = anim;
		if (animCommand.command === "choice" || animCommand.command === "all") currentChoiceAnimation = anim;
	},
});

//#region class definitions
// handles the animation of an array of elements
class Animation {
	#_status;
	options;
	#_elements = [];
	#_originalNodes = [];
	animationNodes = [];
	#_skipController;
	constructor(options) {
		this.options = options || {};
		this.options.mode ??= Animation.Mode.Character;
		this.options.delay ??= 0;
		this.options.length ??= 0;
		this.options.classes ??= [];
		this.options.match ??= undefined;
		this.options.bounds ??= undefined;
		this.options.type ??= Processor.Type.AllElements;
		this.#_skipController = new AbortController();
		this.skipEvent = { callback: this.Skip.bind(this), once: true, priority: -Infinity, preventDefaultAction:true };
		this.#_status = Animation.Status.Ready;
	}
	async Animate(elements) {
		// if (!elements) return;
		if (InkRunner.instance.PrefersReducedMotion) return;
		this.#_skipController = new AbortController();
		this.#_elements = elements;
		this.#_originalNodes = [];
		this.animationNodes = [];

		// init
		await this.Init();

		// animation
		await this.Animation(this.#_skipController.signal);

		// end
		await this.End();
	}
	async Init() {
		this.#_status = Animation.Status.Animating;

		this.#CreateElements();
		if (this.skipEvent) InkRunner.instance.AddEvent("continue", this.skipEvent);
	}
	async Animation(signal = this.#_skipController.signal) {
		//
	}
	async Skip() {
		this.#_skipController.abort();
		this.#_status = Animation.Status.Skipping;
	}
	async End() {
		if (this.skipEvent) InkRunner.instance.RemoveEvent("continue", this.skipEvent);

		this.animationNodes.forEach((node) => node.remove());
		this.#_originalNodes.forEach((parent) => {
			parent.childNodes.forEach((child) => {
				parent.parentNode.insertBefore(child, parent.nextSibling);
			});
		});

		this.#_status = Animation.Status.Finished;
	}

	#CreateElements() {
		const collectElements = (element) => {
			for (let child of element.childNodes) collectElements(child);
			if (element.nodeName !== "#text") return;
			if (this.#_originalNodes.length > 0 && this.#_originalNodes[this.#_originalNodes.length - 1].parentNode === element.parentNode) {
				this.#_originalNodes[this.#_originalNodes.length - 1].childNodes.push(element);
			} else {
				this.#_originalNodes.push({ parentNode: element.parentNode, nextSibling: element.nextElementSibling, childNodes: [element] });
			}
		};

		this.#_elements.forEach((element) => collectElements(element));

		this.#_originalNodes.forEach((e) => {
			// create animation spans
			let animationSpan = Utility.CreateElement("span", { dataset: { irRole: "animation" } });
			let hideSpan = Utility.CreateElement("span", { dataset: { irAnimState: "hide" }, style: { visibility: "hidden" } });

			// append text to hidespan
			e.childNodes.forEach((child) => hideSpan.append(child.textContent));

			// append
			animationSpan.append(hideSpan);
			this.animationNodes.push(animationSpan);

			// insert animation span
			e.parentNode.insertBefore(animationSpan, e.nextSibling);

			// remove original text nodes from dom
			e.childNodes.forEach((child) => child.remove());
		});
	}

	#CustomCheck() {
		if (this.options.mode === Animation.Mode.Match && (!this.options.match || !customMatches?.[this.options.match])) {
			InkRunner.Warn(`#textAnimation: Mode set to CustomMatch but no custom match regular expression provided. Switching to per character`);
			this.options.mode = Animation.Mode.Character;
		}
		if (this.options.mode === Animation.Mode.Bounds && (!this.options.bounds || !customBounds?.[this.options.bounds])) {
			InkRunner.Warn(`#textAnimation: Mode set to CustomBounds but no custom bounds regular expression provided. Switching to per character`);
			this.options.mode = Animation.Mode.Character;
		}
	}

	// return tokens as array
	#MatchTokens(element) {
		let result;
		this.#CustomCheck();
		if (element.textContent.length === 0) return undefined;
		switch (this.options.mode) {
			case Animation.Mode.Character:
				result = element.textContent.split("") || undefined;
				break;
			case Animation.Mode.Word:
				result = element.textContent.match(/.+?(\b|$)/) || undefined;
				break;
			case Animation.Mode.Element:
				result = [element.textContent];
				break;
			case Animation.Mode.Match:
				result = [];
				for (const match of element.textContent.matchAll(customMatches[this.options.match])) result.push(match[0]);
				break;
			case Animation.Mode.Bounds:
				result = [];
				let matches = Array.from(element.textContent.matchAll(customBounds[this.options.bounds]));
				for (let i = 0; i < matches.length; i++) {
					result.push(element.textContent.substring(Math.max(matches[i].index, 0), i === matches.length - 1 ? element.textContent.length : matches[i + 1].index));
				}
				break;
		}
		return result;
	}

	ConsumeToken(element) {
		let tokens = this.#MatchTokens(element);
		if (!tokens) return undefined;
		let result = tokens[0];
		element.innerText = element.textContent.replace(result, "");
		return result;
	}

	GetToken(index, element) {
		let tokens = this.#MatchTokens(element);
		if (!tokens) return undefined;
		return tokens[index];
	}

	GetTokenCount(element) {
		let tokens = this.#MatchTokens(element);
		return tokens?.length;
	}

	SetOptions(options) {
		Object.keys(options).forEach((option) => (this.options[option] = options[option]));
	}

	get mode() {
		return this.options.mode;
	}

	get status() {
		return this.#_status;
	}

	static Status = {
		Ready: 0, // waiting to animate
		Animating: 1, // currently animating
		Skipping: 2, // skipping the animation
		Finished: 3, // finished the animation
	};

	static Mode = {
		Character: 0,
		Word: 1,
		Element: 2,
		Match: 3,
		Bounds: 4,
	};
}

// NOTE: animation should return a promise but BE CAREFUL with async!
// otherwise the promise might continue executing after the skip
// this is because you can't "return" from the promise method from inside an event listener or another method
class ClassAnimation extends Animation {
	intervals = new Set();
	timeouts = new Set();
	async Animation(signal) {
		return new Promise((resolve) => {
			// abort
			let endTimeout;
			const endAnim = () => {
				signal.removeEventListener("abort", endAnim);
				this.intervals.forEach((i) => clearInterval(i));
				this.intervals.clear();
				this.timeouts.forEach((t) => clearTimeout(t));
				this.timeouts.clear();
				resolve();
			};
			signal.addEventListener("abort", endAnim, { once: true });

			const spans = new Map();
			this.animationNodes.forEach((node) => {
				let hideSpan = node.querySelector(`[data-ir-anim-state="hide"]`);
				spans.set(node, {
					main: node,
					hideSpan: hideSpan,
				});
			});

			// recursive animation
			let currentWidth = 0;
			const animateNode = (nodeIndex) => {
				let node = spans.get(this.animationNodes[nodeIndex]);

				// get delays
				let token = this.ConsumeToken(node.hideSpan);
				let tokenKey = token;
				if (!/\s+/g.test(tokenKey)) tokenKey = tokenKey.trim().slice(-1) || undefined;
				let delayLength = Math.max(this.options.delay + (this.options.tokenOffsets?.[tokenKey]?.delayOffset || 0.0), 0);
				let animLength = Math.max(this.options.length + (this.options.tokenOffsets?.[tokenKey]?.animationOffset || 0.0), 0);

				// create the span that will handle the animation
				let animSpan = Utility.CreateElement("span", { innerText: token, dataset: { irAnimState: "animating" } });
				if (this.options.classes) {
					animSpan.style.setProperty("--animLength", Utility.NumberToCSSTime(animLength));
					animSpan.classList.add(...(this.options.classes || []));
				}

				node.hideSpan.before(animSpan);

				const delayTimeout = setTimeout(() => {
					const animTimeout = setTimeout(() => {
						// if set, remove class from anim span
						if (this.options.removeClasses) animSpan.classList.remove(...(this.options.classes || []));
						this.timeouts.delete(animTimeout);
					}, animLength);
					this.timeouts.add(animTimeout);

					// remove the hide span since if it's empty
					if (!node.hideSpan.textContent.length) node.hideSpan.remove();

					// remove delay timeout
					this.timeouts.delete(delayTimeout);

					// process next token/node
					if (this.GetToken(0, node.hideSpan)) {
						// next token
						animateNode(nodeIndex);
					} else if (nodeIndex < this.animationNodes.length - 1) {
						// next node
						animateNode(nodeIndex + 1);
					} else {
						// last token of last node
						this.timeouts.add(setTimeout(endAnim, animLength));
					}
				}, delayLength);
				this.timeouts.add(delayTimeout);
			};

			// start animation
			animateNode(0);
		});
	}
}

//#endregion
