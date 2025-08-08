/**
 * InkRunner - "The Pervert's Edition"
 * (c) 2024 isyourguy
 * Special thanks to:
 * Inkle for making ink (https://github.com/inkle/ink)
 * Yannick (and others) for making inkjs (https://github.com/y-lohse/inkjs)
 * Elliot for making Calico (https://github.com/elliotherriman/calico)
 * haraiva for making games (https://haraiva.itch.io/)
 */

class InkRunner {
	static #_instance;
	storyPath;
	story;
	externalFiles;
	#_tagTypes = {}; // this is populated at runtime by processors
	#_status;
	#_passage;
	#_processors = [];
	#_variableprocessors = [];
	#_defaultContainer;
	#_container;
	#_containerObserver;
	#_defaultFlowName;
	#_blockContinue = false; // used for blocking continue/choices TODO: find a better solution

	// default text/choice/html processors (stored as variables so they can be removed)
	defaultAppendText;
	defaultAppendChoice;
	defaultConvertTextToHTML;
	defaultConvertChoicesToHTML;

	#_actions = new Map();

	options = {
		debug: false,
		verbose: false,
		storyContainer: undefined,
		continueAfterChoice: true,
		continueAfterChoiceOutputText: false, // not using this yet
		renderNewlines: false, // never have this switched on, so it might break
		autoScroll: true,
		inkPath: "./js/ink-full.js", // default, but you can pass a different one to inkloader
	};

	/**
	 * @param {string} storyPath - Path to story (ink or json)
	 * @param {Object} options - Override startup options
	 * @param {boolean} options.debug - Defaults to false. Spits out debug messages to console
	 * @param {HTMLElement} options.storyContainer - Defaults to undefined. Use this for the default story container instead of creating one
	 * @param {boolean} options.renderNewLines - Defaults to true. You should turn it off if you're doing any text processing
	 * @param {boolean} options.autoScroll - Defaults to true.
	 */
	constructor(storyPath, options) {
		if (!storyPath) InkRunner.Error("No story path provided!");
		this.storyPath = storyPath;

		// merge options
		if (options) this.options = { ...this.options, ...options };

		// singleton makes it easier than passing references around
		if (InkRunner.#_instance) return InkRunner.#_instance;
		InkRunner.#_instance = this;

		// create default actions
		this.#CreateDefaultActions();

		// create default processors and add them
		this.#CreateDefaultProcessors();
		this.AddProcessor(this.defaultConvertTextToHTML, this.defaultConvertChoicesToHTML, this.defaultAppendText, this.defaultAppendChoice);

		this.SetStatus(InkRunner.Status.Active);
		window.dispatchEvent(new CustomEvent("StoryActive", { detail: { inkrunner: this } }));
	}

	static get instance() {
		return InkRunner.#_instance;
	}

	//#region load
	async LoadInkjs(modulePath) {
		modulePath ||= Utility.ConvertToAbsolutePath(this.options.inkPath);
		if (!modulePath) InkRunner.Error("No inkjs module provided!");
		modulePath = Utility.ConvertToAbsolutePath(modulePath);
		await import(modulePath);
		try {
			inkjs;
		} catch {
			InkRunner.Error("Provided inkjs module does not contain global inkjs object");
		}
		if (!inkjs.Story) InkRunner.Error("Provided inkjs does not contain Story definition");
		InkRunner.Log(`inkjs loaded (json version ${inkjs.Story.inkVersionCurrent} | ${!inkjs.Compiler ? "compiler not loaded" : "compiler loaded"})`);
	}

	// returns compiled json
	async CompileStory(path) {
		if (!inkjs.Compiler) InkRunner.Error("Tried to compile story, but inkjs does not contain Compiler");
		if (!path.trim()) InkRunner.Error("Tried to compile story, but no story path provided");

		// vscode says await has no effect here, but it definitely does!
		let text = await this.CreateStoryString(path);
		let json = "";
		return new Promise(async (resolve, reject) => {
			try {
				// using these compiler options, the inkjs compiler matches inky exactly
				// specifically the third argument - the rest are defaults
				json = new inkjs.Compiler(text, new inkjs.CompilerOptions(null, [], true, null, null)).Compile().ToJson();
			} catch (e) {
				InkRunner.Error(`Couldn't compile ink story "${path}"`);
			}
			InkRunner.Log(`Compiled ink story`);
			resolve(json);
		});
	}

	/**
	 * Creates a story string
	 * @param {string} path path to .json or .ink file
	 * @returns {string} the ink story (json string or ink string)
	 */
	async CreateStoryString(path) {
		let basePath = Utility.FilePathExtension(path).path;
		const loop = async (path) => {
			let mainString = "";
			let [includes, promises] = Array(2).fill([]);
			let text;
			try {
				await fetch(path).then(async (res) => {
					if (!res.ok) throw new Error();
					text = await res.text();
				});
			} catch {
				InkRunner.Error(`File "${path}" not found or couldn't be loaded.`);
			}
			let ext = Utility.FilePathExtension(path).extension;
			switch (ext) {
				case ".json":
					mainString += text;
					break;
				case ".ink":
					let endOfIncludesIndex = 0;
					for (const match of text.matchAll(/^\s*INCLUDE (.+\.ink)/gim)) {
						endOfIncludesIndex += match[0].length + 1;
						includes.push(match[1]);
					}
					mainString += text.substring(endOfIncludesIndex);
					includes.forEach((include) => promises.push(loop(basePath + include)));
					(await Promise.all(promises)).forEach((include) => (mainString += `\n${include}`));
					break;
				default:
					InkRunner.Error(`Tried to load unrecognised file extension "${ext}" as an ink story.`);
					break;
			}
			return mainString;
		};
		return loop(path);
	}

	async LoadStory(json) {
		// take json string and load story
		try {
			this.story = new inkjs.Story(json);
		} catch (e) {
			InkRunner.Error(`Couldn't load story "${this.storyPath}".`);
		}
		this.#_defaultFlowName = this.story.currentFlowName;

		// get default container (user provided or create a new one)
		this.#_defaultContainer = this.options.storyContainer ? this.SetContainer(this.options.storyContainer) : this.SetContainer(Utility.CreateElement("div", { id: "inkContainer" }));
		this.SetStatus(InkRunner.Status.Idle);
		window.dispatchEvent(new CustomEvent("StoryLoaded", { detail: { inkrunner: this } }));
	}
	//#endregion
	//region continue
	get canContinue() {
		return this.story.canContinue;
	}

	// TODO: this is bad and only exists for the #continueUntil tag
	// find a better way of doing this
	SetContinueBlock(block) {
		this.#_blockContinue = block;
	}

	get continueBlockStatus() {
		return this.#_blockContinue;
	}

	#ContinueCheck() {
		if (!this.story.canContinue && this.story.currentChoices.length > 0) {
			InkRunner.Warn(`Story cannot continue: Waiting for choice.`);
			return false;
		}

		if (this.currentStatus === InkRunner.Status.Finished && !this.story.canContinue) {
			InkRunner.Warn(`Story cannot continue: Story has finished.`);
			return false;
		}

		if (this.currentStatus === InkRunner.Status.Active) {
			InkRunner.Warn(`Story cannot continue: InkRunner is currently Active and processing inkjs output.`);
			return false;
		}

		if (this.currentStatus !== InkRunner.Status.Idle) {
			InkRunner.Warn(`Story cannot continue: Story is not Idle`);
			return false;
		}

		return true;
	}

	// TODO: this is kinda broken rn
	async ContinueMaximally() {
		InkRunner.Warn(`ContinueMaximally is kinda broken. Don't expect it to work.`);
		if (!this.#ContinueCheck()) return;
		while (this.story.canContinue) {
			await this.Continue();
		}
	}

	async Continue(forceContinue = false) {
		if (!this.#ContinueCheck() && !forceContinue) return;

		if (this.#_blockContinue && !forceContinue) {
			InkRunner.Warn(`Something has told InkRunner to not continue. (A processor maybe?)`);
			return;
		}

		this.SetStatus(InkRunner.Status.Active);
		// let consoleGroup = `Passage - ${new Date().toLocaleTimeString()}`;
		// if (this.options.debug) console.groupCollapsed(consoleGroup);
		InkRunner.Log(`Passage - ${new Date().toLocaleTimeString()}`);

		InkRunner.Log("Story Continuing");
		window.dispatchEvent(new CustomEvent("StoryContinuing", { detail: { inkrunner: this } }));

		this.#_passage = new Passage();
		for await (const stage of Object.values(InkRunner.ProcessingStage)) {
			let ignoredProcessorTypes = stage.index < InkRunner.ProcessingStage.PostHTMLConversion.index ? [Processor.Type.TextElement, Processor.Type.ChoiceElement, Processor.Type.AllElements] : [Processor.Type.TextRaw, Processor.Type.ChoiceRaw, Processor.Type.AllRaw];
			await this.#ProcessStage(stage, { ignoreProcessorTypes: ignoredProcessorTypes });
		}

		InkRunner.Log("Completed passage", this.#_passage);

		let tagCount = this.#_passage.array.filter((p) => p.type === PassageObject.Type.Tag).length;
		let textCount = this.#_passage.array.filter((p) => p.type === PassageObject.Type.Text).length;
		let choiceCount = this.#_passage.array.filter((p) => p.type === PassageObject.Type.Choice).length;
		let storyEnded = !this.story.canContinue && choiceCount === 0;

		if (textCount > 0) this.SetStatus(InkRunner.Status.Idle);
		if (choiceCount > 0) this.SetStatus(InkRunner.Status.Waiting);
		if (storyEnded) this.SetStatus(InkRunner.Status.Finished);

		dispatchEvent(new CustomEvent("ContinueComplete", { detail: { inkrunner: this, tagCount: tagCount, textCount: textCount, choiceCount: choiceCount } }));
		if (textCount > 0) dispatchEvent(new CustomEvent("TextRendered", { detail: { inkrunner: this } }));
		if (choiceCount > 0) dispatchEvent(new CustomEvent("ChoiceRendered", { detail: { inkrunner: this } }));
		if (storyEnded) dispatchEvent(new CustomEvent("StoryEnded", { detail: { inkrunner: this } }));
		// console.groupEnd(consoleGroup);
	}

	async #ProcessStage(stage, options = { ignorePassageTypes: [], ignoreProcessorTypes: [] }) {
		// stage specific hard-coded stuff
		switch (stage) {
			case InkRunner.ProcessingStage.RawData:
				(await this.#GetInkjsOutput()).forEach((output) => {
					let passageObject = new PassageObject({ type: output.type, choiceTarget: output.choiceTarget });
					passageObject[output.type] = output.object;
					this.#_passage.AddPassageObject(passageObject);
				});
				break;
			case InkRunner.ProcessingStage.Final:
				// quick check to see if we hit unrecognised tags
				let tagNames = this.#_passage.array.filter((p) => p.type === PassageObject.Type.Tag).map((p) => p.tag.name);
				let processorNames = this.#_processors.filter((p) => p.type === Processor.Type.Tag).map((p) => p.tag);
				tagNames.filter((t) => !processorNames.includes(t)).forEach((t) => InkRunner.Warn(`No matching processor for tag "${t}"`));
				break;
		}
		let processors = this.#_processors.filter((p) => p.stage === stage && !options.ignoreProcessorTypes.includes(p.type));

		// skip checks
		if (processors.length === 0) {
			InkRunner.Log(`${stage.name} - No processors. Skipping to next stage.`);
			return;
		}

		InkRunner.Log(`${stage.name} - Processing stage.`);
		processors.sort((a, b) => b.priority - a.priority);
		// loop through passage elements and run the applicable processors
		for (let i = 0; i < this.#_passage.array.length; i++) {
			if (options.ignorePassageTypes?.includes(this.#_passage.array[i].type)) continue;
			let target = this.#_passage.GetTarget(i);
			await this.#ProcessPassageObject({
				passageObject: this.#_passage.array[i],
				processors: processors.filter((p) => this.#_passage.array[i].compatibleProcessorTypes.includes(p.type)),
				target: target?.elements,
				textElement: this.#_passage.indices[PassageObject.Type.Text] ? this.#_passage.array[this.#_passage.indices[PassageObject.Type.Text]] : undefined,
				choiceElement: this.#_passage.indices[PassageObject.Type.Choice] ? this.#_passage.array[this.#_passage.indices[PassageObject.Type.Choice]] : undefined,
			});
		}
		InkRunner.Log(`${stage.name} - Stage complete.`);
	}
	//#endregion
	async #GetInkjsOutput() {
		// get the output stream and process it
		// we also peek at the next few outputStreams as well
		// this is to ensure we capture tags on their own line without any text and choices that sit right after a line of text
		let output = [];
		while (this.story.canContinue) {
			let lastSnapshot = await this.story.state.toJson();
			this.story.Continue();
			let processedStream = await this.#ProcessStream(this.story.state.outputStream);

			// if the new passage contains text (and not a choice) and we've already got some, fall back to the last snapshot
			const passageContainsText = output.filter((p) => p.type === "text").length > 0;
			const newLineContainsText = processedStream.filter((p) => p.type === "text").length > 0;
			const newLineContainsChoice = processedStream.filter((p) => p.type === "choices").length > 0;
			if (passageContainsText && (newLineContainsText || !newLineContainsChoice)) {
				await this.story.state.LoadJson(lastSnapshot);
				break;
			}

			// passage is all good, so add it to the array
			output.push(...processedStream);

			// if this passage contains a choice, use the current snapshot
			if (newLineContainsChoice) break;
		}
		return output;
	}
	/**
	 * Creates an InkRunner "Passage" array from the inkjs outputStream
	 * @param {Array} outputStream The outputStream from the inkjs Story.state
	 * @returns An InkRunner "Passage" array
	 */
	async #ProcessStream(outputStream) {
		let passage = [];
		let processingTag = false;
		let textIndex = -1;
		for (let i = 0; i < outputStream.length; i++) {
			// build tag objects from the commands coming from inkjs
			// this is weird and fucked up because variables inside tags are split over multiple array elements 🥴
			if (outputStream[i]._commandType === 24) {
				let tagstring = "";
				processingTag = true;
				while (processingTag) {
					i++;
					tagstring += outputStream[i].value || "";
					if (outputStream[i]._commandType === 25) {
						processingTag = false;
						passage.push({ type: "tag", object: this.ProcessTagString(tagstring) });
					}
				}
				continue;
			}

			// text objects
			if (!outputStream[i]._isNewline && outputStream[i].value) {
				if (outputStream[i].value.trim().length !== 0) {
					// merge all text into a single object
					// this is to handle choices with text both before and after the square brackets
					// since after a choice, we get two text objects
					// also glue
					if (textIndex < 0) {
						passage.push({ type: "text", object: outputStream[i].value });
						textIndex = passage.length - 1;
					} else {
						passage[textIndex].object += outputStream[i].value;
					}
				}
			}

			// newline objects
			if (outputStream[i]._isNewline) passage.push({ type: "newline" });
		}

		// if there's choices, grab those and append them to the passage array
		if (this.story.currentChoices && this.story.currentChoices.length > 0) {
			let choicesObject = { type: "choices", object: [] };
			// i shouldn't need to dedupe this array but once i got two entries for the same choice so.... 🤷
			Utility.DeduplicateArray(this.story.currentChoices).forEach((choice) => {
				// grabbing tags for individual choices
				choice.tags.forEach((tag) => {
					passage.push({ type: "tag", choiceTarget: choice.index, object: this.ProcessTagString(tag) });
				});
				choicesObject.object.push(Object.assign(choice, { value: choice.text }));
			});
			passage.push(choicesObject);
		}
		return passage;
	}

	async #ProcessPassageObject(options) {
		let passageObject = options.passageObject;
		let processors = options.processors;
		let target = options.target;
		let promises = [];
		for (const processor of processors) {
			let args = {};
			args.type = passageObject.type;
			args.target = target;
			args.passage = options.passageObject;
			args[passageObject.type] = passageObject[passageObject.type];
			if (processor.type === Processor.Type.Tag) {
				if (processor.tag !== passageObject.tag.name) continue;
				args.tag = passageObject.tag;
				args.target = target;
				if (passageObject.choiceTarget) {
					let choiceElement;
					// technically we're just using "some()" here as an early-exit loop
					target.some((e) => {
						if (e.dataset.irChoiceIndex && parseInt(e.dataset.irChoiceIndex) === passageObject.choiceTarget) choiceElement = e;
						if (!choiceElement) choiceElement = e.querySelector(`a[data-ir-choice-index="${passageObject.choiceTarget}"]`);
						if (choiceElement) return true;
					});
					if (choiceElement) args.target = [choiceElement];
				}
			}
			promises.push(
				await processor.Process(args).then((e) => {
					if (e === undefined) return;
					if (processor.type === Processor.Type.Tag) return;
					switch (processor.stage) {
						case InkRunner.ProcessingStage.RawData:
						case InkRunner.ProcessingStage.PreHTMLConversion:
							passageObject[passageObject.type] = e;
							break;
						default:
							passageObject.elements = e;
							break;
					}
				})
			);
		}
		await Promise.all(promises);
	}

	//#region funcs
	/**
	 * Choose and continue the story with the provided choice index
	 * @param {number} index - Choice index (starts from 0)
	 */
	Choose(index) {
		if (this.#_blockContinue) {
			InkRunner.Warn(`Something has told InkRunner to not allow choices. (A processor maybe?)`);
			return;
		}
		index = parseInt(index);
		if (index > this.story.currentChoices.length - 1) {
			InkRunner.Warn(`Choice index ${index} out of range`);
			return;
		}
		document.querySelectorAll('[data-ir-role="choice"]').forEach((choice) => choice.remove());
		window.dispatchEvent(new CustomEvent("ChoiceMade", { detail: { story: this.story, choice: this.story.currentChoices[index] } }));
		this.story.ChooseChoiceIndex(index);
		this.SetStatus(InkRunner.Status.Idle);
		if (this.options.continueAfterChoice) this.Continue();
	}

	// TODO: this breaks if you jump during a choice
	// not sure how to handle this...
	JumpToKnot(knotname, preserveCallStack = false) {
		// probably shouldn't jump knots if the story is active or busted
		if (this.#_status === InkRunner.Status.Active || this.#_status === InkRunner.Status.Error) {
			InkRunner.Warn(`Tried to jump to a knot while the story was active or otherwise broken.`);
			return;
		}
		if (this.story.currentFlowName === knotname) {
			InkRunner.Warn(`Tried to jump to the knot we're already in.`);
			return;
		}
		this.ChangeFlow(knotname, preserveCallStack);
		this.story.ChoosePathString(knotname, preserveCallStack);
		this.SetStatus(InkRunner.Status.Idle);
	}

	ChangeFlow(newflow = this.#_defaultFlowName, destroyPreviousFlow = true) {
		// probably shouldn't change flow if the story is active or busted
		if (this.#_status === InkRunner.Status.Active || this.#_status === InkRunner.Status.Error) {
			InkRunner.Warn(`Tried to change story flow while the story was active or otherwise broken.`);
			return;
		}
		let oldflow = this.story.currentFlowName;
		this.story.SwitchFlow(newflow);
		if (destroyPreviousFlow && oldflow !== this.#_defaultFlowName) this.story.RemoveFlow(oldflow);
		this.SetStatus(this.story.currentChoices.length > 0 ? InkRunner.Status.Waiting : InkRunner.Status.Idle);
	}
	/**
	 * Resets the ink.js story state
	 * NOTE: The only thing this does to InkRunner itself is reset the story flow and set the InkRunner status to Idle
	 */
	ResetStory() {
		this.story.ResetState();
		this.SetStatus(InkRunner.Status.Idle);
		this.ChangeFlow();
	}

	ProcessTagString(tag) {
		// if we find this string in the tag, it's because we're parsing a dynamic tag from the ink json directly
		// unfortunately we can't do anything about this so we just skip it.
		if (tag.includes(`"VAR?":`)) return undefined;

		let tagObject = { name: undefined, value: undefined, options: {} };
		let optionsArray = [];

		// absolutely COOKED regex bro
		// const tagRegex = /^(?<name>[\w\s]+)(?::\s*)?(?<value>[\w\s"/.']*)(?:>>\s*)?(?<options>.*)/g;
		const tagRegex = /^(?<name>[\w\s]+)(?::\s*)?(?<value>[^<>:\\|?*\n\r]*)(?:>>\s*)?(?<options>.*)/g;

		for (const match of tag.matchAll(tagRegex)) {
			tagObject.name = match.groups.name?.trim();
			if (match.groups.value) tagObject.value = match.groups.value?.trim();
			if (match.groups.options) optionsArray = match.groups.options?.split(",").map((e) => e.trim());
		}
		if (tagObject.value) tagObject.value = Utility.SplitStringPreserveQuotes(tagObject.value);

		optionsArray.forEach((option) => {
			let split = option.split(":").map((e) => e.trim());
			tagObject.options[split[0]] = split.length > 1 ? split[1] : true;
		});

		return tagObject;
	}

	AddProcessor() {
		if (arguments.length === 0) InkRunner.Error(`AddProcessor needs at least 1 argument.`);
		Object.values(arguments).forEach((processor) => {
			if (processor.constructor.name !== "Processor") {
				InkRunner.Warn(`AddProcessor only accepts "Processor" objects.`);
				return;
			}
			switch (processor.type) {
				case Processor.Type.Variable:
					if (!this.#_variableprocessors.includes(processor)) {
						this.#_variableprocessors.push(processor);
						this.story.ObserveVariable(processor.tag, processor.Process);
					}
					break;
				default:
					if (!this.#_processors.includes(processor)) {
						processor.story = this;
						this.#_processors.push(processor);
					}
					break;
			}
		});
	}

	RemoveProcessor() {
		if (arguments.length === 0) {
			InkRunner.Error(`AddProcessor needs at least 1 argument.`);
			return;
		}

		Object.values(arguments).forEach((processor) => {
			if (processor.constructor.name !== "Processor") {
				InkRunner.Warn(`RemoveProcessor only accepts "Processor" objects.`);
				return;
			}
			switch (processor.type) {
				case Processor.Type.Variable:
					this.#_variableprocessors = Utility.RemoveElements(this.#_variableprocessors, processor);
					this.story.RemoveVariableObserver(processor.tag, processor.Process);
					break;
				default:
					this.#_processors = Utility.RemoveElements(this.#_processors, processor);
					break;
			}
		});
	}

	// creates the default text/choice/html processors
	#CreateDefaultProcessors() {
		this.defaultAppendText = new Processor({
			name: "Append Text",
			type: Processor.Type.TextElement,
			stage: InkRunner.ProcessingStage.AppendText,
			priority: -Infinity,
			callback: async (params, inkrunner) => {
				inkrunner.currentContainer.append(...params.target);
				window.dispatchEvent(new CustomEvent("TextAppended", { detail: { inkrunner: inkrunner, container: inkrunner.currentContainer } }));
			},
		});
		this.defaultAppendChoice = new Processor({
			name: "Append Choices",
			type: Processor.Type.ChoiceElement,
			stage: InkRunner.ProcessingStage.AppendChoices,
			priority: -Infinity,
			callback: async (params, inkrunner) => {
				inkrunner.currentContainer.append(...params.target);
				window.dispatchEvent(new CustomEvent("ChoicesAppended", { detail: { inkrunner: inkrunner, container: inkrunner.currentContainer } }));
			},
		});
		this.defaultConvertTextToHTML = new Processor({
			name: "Convert to text HTML",
			type: Processor.Type.TextRaw,
			stage: InkRunner.ProcessingStage.HTMLConversion,
			priority: -Infinity,
			callback: async (params, inkrunner) => {
				let passage = params.passage;
				let frag = document.createRange().createContextualFragment(passage.text.trim());
				if (frag.childNodes.length === 1 && frag.childNodes[0].nodeName === "#text") {
					frag = document.createDocumentFragment();
					frag.append(Utility.CreateElement("span", { innerText: passage.text.trim(), dataset: { irRole: "text" } }));
				}
				passage.elements = Array.from(frag.childNodes);
			},
		});
		this.defaultConvertChoicesToHTML = new Processor({
			name: "Convert to choices HTML",
			type: Processor.Type.ChoiceRaw,
			stage: InkRunner.ProcessingStage.HTMLConversion,
			priority: -Infinity,
			callback: async (params, inkrunner) => {
				let passage = params.passage;
				let frag = document.createDocumentFragment();
				passage.choices.forEach((choice) => {
					let element = Utility.CreateElement("a", { innerText: choice.text, dataset: { irRole: "choice", irChoiceIndex: choice.index, irChoiceText: choice.text } });
					element.inkdata = choice;
					this.AddTrigger("choose", { target: element, listener: "click", arguments: choice.index, once: true, stopPropagation: true });
					frag.append(element);
				});
				passage.elements = Array.from(frag.childNodes);
			},
		});
	}

	#CreateDefaultActions() {
		this.CreateAction("continue", {
			defaultEvent: (e) => this.Continue(e),
		});
		this.CreateAction("choose", {
			defaultEvent: (e) => this.Choose(e),
		});
	}

	CreateAction(actionName, action = {}) {
		action.events ??= [];
		action.triggers ??= [];
		if (!this.#_actions.get(actionName)) this.#_actions.set(actionName, action);
	}

	RemoveAction(actionName) {
		let action = this.#_actions.get(actionName);
		if (!action) return;
		action.triggers.forEach((trigger) => {
			this.RemoveTrigger(actionName, trigger);
		});
		this.#_actions.delete(actionName);
	}

	AddEvent(actionName, event) {
		let action = this.#_actions.get(actionName);
		if (!action) return;
		event.priority ??= 0;
		action.events.push(event);
		action.events.sort((a, b) => b.priority - a.priority);
	}

	RemoveEvent(actionName, event) {
		let action = this.#_actions.get(actionName);
		if (!action) return;
		action.events.splice(action.events.indexOf(event), 1);
	}

	AddTrigger(actionName, trigger) {
		let action = this.#_actions.get(actionName);
		if (!action) return;
		action.triggers.push(trigger);
		trigger.target ??= window;
		trigger.controller = new AbortController();
		trigger.target.addEventListener(
			trigger.listener,
			async (e) => {
				if (e.key && trigger.key !== e.key) return;
				if (trigger.preventDefault) e.preventDefault();
				if (trigger.stopPropagation) e.stopPropagation();
				if (trigger.stopImmediatePropagation) e.stopImmediatePropagation();
				let preventDefaultAction = false;
				action.events.some(async (event) => {
					preventDefaultAction = event.preventDefaultAction || preventDefaultAction;
					await event.callback?.(e);
					if (event.once) this.RemoveEvent(actionName, event);
					return event.haltEventQueue || false;
				});
				if (trigger.once) this.RemoveTrigger(actionName, trigger);
				if (!preventDefaultAction) {
					typeof trigger?.arguments === "object" ? await action.defaultEvent?.(...trigger.arguments) : await action.defaultEvent?.(trigger?.arguments);
				}
			},
			{ signal: trigger.controller.signal }
		);
	}

	RemoveTrigger(actionName, trigger) {
		let action = this.#_actions.get(actionName);
		if (!action) return;
		if (typeof trigger === "string") {
			let index = action.events.findIndex((e) => e.name === trigger);
			if (index === -1) {
				InkRunner.Warn(`No trigger with name "${trigger}"`);
				return;
			}
			trigger = action.events[index];
		}
		if (!action.triggers.includes(trigger)) {
			InkRunner.Warn(`Trigger not associated with action`);
			return;
		}
		trigger.controller.abort();
		action.triggers.splice(action.triggers.indexOf(trigger), 1);
	}

	get actions() {
		return this.#_actions;
	}

	get PrefersReducedMotion() {
		return window.matchMedia(`(prefers-reduced-motion: reduce)`).matches === true;
	}

	// TODO: redo the container system (kind of unintuitive)
	SetContainer(target) {
		if (!Utility.IsElement(target)) {
			InkRunner.Warn(`${target} is not a HTMLElement`);
			return;
		}
		if (this.#_container) {
			this.#_container.dataset.irRole = "container";
			this.#_container.dataset.irActive = false;
		}
		if (!document.body.contains(target)) document.body.append(target);
		target.dataset.irRole = "container";
		target.dataset.irActive = true;
		this.#_container = target;
		if (this.options.autoScroll) {
			this.DisableAutoScroll();
			this.EnableAutoScroll();
		}
		return this.#_container;
	}

	ResetContainer(options = { deletePrevious: true }) {
		return this.SetContainer(this.#_defaultContainer, options);
	}
	get currentContainer() {
		return this.#_container;
	}
	get defaultContainer() {
		return this.#_defaultContainer;
	}
	set defaultContainer(container) {
		this.#_defaultContainer = container;
	}

	EnableAutoScroll() {
		this.#_containerObserver = new MutationObserver(this.#DebouncedScroll(10));
		this.#_containerObserver.observe(this.#_container, { attributes: false, childList: true, subtree: true });
		addEventListener("resize", this.#DebouncedScroll(100));
	}

	DisableAutoScroll() {
		this.#_containerObserver?.disconnect();
		removeEventListener("resize", this.#DebouncedScroll(100));
	}

	#DebouncedScroll(time) {
		return Utility.Debounce(() => {
			if (this.#_container.lastElementChild) {
				this.#_container.scrollTop = this.#_container.scrollHeight;
			}
		}, time);
	}

	// tag types are mainly added by media tags so that
	// the preloader knows what to do with them
	AddTagType(property, tagType) {
		if (!tagType.type || !tagType.path || !tagType.extensions || !tagType.tags) InkRunner.Error("Tried to add malformed tag type.", tagType);
		tagType.path = Utility.ConvertToAbsolutePath(tagType.path);
		tagType.path = tagType.path[tagType.path.length - 1] !== "/" ? tagType.path + "/" : tagType.path;
		this.#_tagTypes[property] = tagType;
	}

	get tagTypes() {
		return this.#_tagTypes;
	}

	SetStatus(status) {
		this.#_status = status;
	}

	get currentStatus() {
		return this.#_status;
	}

	static Status = {
		Idle: 0, // story is ready to continue
		Waiting: 1, // story is waiting for input
		Active: 2, // story is currently doing something
		Finished: 3, // story is finished
		Error: 4, // something bad happen
	};

	static ProcessingStage = {
		Start: { index: 0, name: "Start", description: "Beginning passage processing" },
		RawData: { index: 1, name: "Raw Data", description: "Fetching output stream from InkJS" },
		PreHTMLConversion: { index: 2, name: "Pre-HTML Conversion" },
		HTMLConversion: { index: 3, name: "HTML Conversion", description: "Converting passage to HTML elements" },
		PostHTMLConversion: { index: 4, name: "Post HTML Conversion", description: "After converting passage to HTML elements" },
		PreAppendText: { index: 5, name: "Pre-Append Text" },
		AppendText: { index: 6, name: "Append Text", description: "Appending text to DOM" },
		PreAppendChoices: { index: 7, name: "Pre-Append Choices" },
		AppendChoices: { index: 8, name: "Append Choices", description: "Appending choices to DOM" },
		Final: { index: 9, name: "Final", description: "Passage processing complete" },
	};

	static Log() {
		if (this.instance.options.debug && this.instance.options.verbose) console.log("InkRunner:", ...arguments);
	}

	static Warn() {
		if (this.instance.options.debug) console.warn("InkRunner:", ...arguments);
	}

	static Error() {
		this.instance.SetStatus(InkRunner.Status.Error);
		console.error("InkRunner:", ...arguments);
		throw new Error("InkRunner:", arguments[0]);
	}
}

//#region processor
class Processor {
	// #_defaultActionOptions = ["target", "delayTime", "delaySkip", "delayAfter", "class", "classAfter", "id"];
	#_defaultActionOptions = ["target", "id", "preDelay", "postDelay", "preClass", "postClass"];
	/**
	 * @param {Object} options
	 * @param {string} options.name
	 * @param {string} options.author
	 * @param {string} options.description
	 * @param {Processor.Type} options.type
	 * @param {InkRunner.ProcessingStage} options.stage
	 * @param {string} options.tag
	 * @param {number} options.priority
	 * @param {function} options.callback
	 */
	constructor(options) {
		this.name = options.name;
		this.author = options.author;
		this.description = options.description;
		this.type = options.type || Processor.Type.Tag;
		this.stage = options.stage || 0;
		this.tag = options.tag;
		this.priority = options.priority || 0;
		this.callback = options.callback;
		this.defaultOptions = options.defaultOptions || {};
		this.defaultActions = { delay: true, class: true, id: true, target: true, ignoreUnknownOptions: false, ...options.defaultActions };
		if (!Object.values(InkRunner.ProcessingStage).includes(this.stage) && this.type !== Processor.Type.Variable) {
			console.warn(`Processor: created processor "${this.name}" has no assigned stage. It will not be run.`);
		}
		if (this.type === Processor.Type.Tag && !this.tag) {
			console.warn(`Processor: created tag processor "${this.name}" with no tag name.`);
		}
		if (!this.callback || this.callback == {}) {
			console.warn(`Processor: created processor "${this.name}" with no callback.`);
		}

		// Utility.BindFunctions(this);
	}
	async Process() {
		InkRunner.Log(`${this.name || this.tag} - Processing.`, arguments);
		let args = Object.assign({}, ...arguments);
		await this.#Preprocess(args);
		window.dispatchEvent(new CustomEvent("ProcessorStart", { detail: { inkrunner: InkRunner.instance, name: this.name, arguments: args } }));
		let returnValue = await new Promise((resolve) => resolve(this.callback(args, InkRunner.instance, this)));
		await this.#Postprocess(args);
		if (returnValue) return returnValue;
	}
	async #Preprocess(args) {
		if (this.type === Processor.Type.Tag) {
			// merge default options with actual options
			if (this.defaultOptions) Object.keys(this.defaultOptions).forEach((key) => (args.tag.options[key] ||= this.defaultOptions[key]));
			// try to cast options into appropriate types
			Object.keys(args.tag.options).forEach((key) => {
				if (typeof args.tag.options[key] !== "string") return;
				if (/^[\d.]*$/g.test(args.tag.options[key])) args.tag.options[key] = parseFloat(args.tag.options[key]);
				if (/^true|false$/g.test(args.tag.options[key])) args.tag.options[key] = args.tag.options[key] === "true" ? true : false;
			});
			if (args.tag.options.target) this.#SetTarget(args);
			this.#ConvertUnknownOptions(args);
			if (args.tag.options.id) this.#SetId(args);
			if (args.tag.options.preClass) this.#ClassActions({ target: args.target, class: args.tag.options.preClass });
			if (args.tag.options.preDelay)
				await this.#DelayActions({
					delayTime: Number.isFinite(args.tag.options.preDelay) ? args.tag.options.preDelay : args.tag.options.preDelay.split(" ")[0],
					delaySkip: Number.isFinite(args.tag.options.preDelay) ? false : args.tag.options.preDelay.split(" ")[1] === "skip" ? true : false,
				});
		}
	}
	async #Postprocess(args) {
		if (this.type === Processor.Type.Tag) {
			if (args.tag.options.postClass) this.#ClassActions({ target: args.target, class: args.tag.options.postClass });
			if (args.tag.options.postDelay)
				await this.#DelayActions({
					delayTime: Number.isFinite(args.tag.options.postDelay) ? args.tag.options.postDelay : args.tag.options.postDelay.split(" ")[0],
					delaySkip: Number.isFinite(args.tag.options.postDelay) ? false : args.tag.options.postDelay.split(" ")[1] === "skip" ? true : false,
				});
		}
	}
	async #SetTarget(args) {
		if (!this.defaultActions.target) return;
		let target = (args.target = Utility.SplitStringPreserveQuotes(args.tag.options.target)
			.map((id) => document.getElementById(id))
			.filter((t) => t !== undefined && t !== null));
		if (!target[0]) {
			InkRunner.Warn(`Processor: Couldn't find target with any of the ids "${args.tag.options.target}"`);
			args.target = undefined; // set target to undefined so processors can handle this on their end
		}
	}
	async #ConvertUnknownOptions(args) {
		let unknownOptions = Utility.ObjectFilter(args.tag.options, (option) => !Object.keys(this.defaultOptions).includes(option[0]) && !this.#_defaultActionOptions.includes(option[0]));
		if (args.target) args.target.forEach((element) => Utility.AddCSSVariables(unknownOptions, element));
		if (!args.target) Utility.AddCSSVariables(unknownOptions);
	}
	async #SetId(args) {
		if (!this.defaultActions.id) return;
		let commandArray = Utility.CommandArray(Utility.SplitStringPreserveQuotes(args.tag.options.id), ["add", "remove"]);
		commandArray.forEach((c) => {
			c.values.forEach((v) => {
				switch (c.command) {
					case "add":
						let used = document.getElementById(v) || false;
						args.target?.forEach((t) => {
							if (!used && !t.hasAttribute("id")) {
								t.id = v;
								used = true;
							}
						});
						break;
					case "remove":
						document.getElementById(v)?.removeAttribute("id");
						break;
				}
			});
		});
	}
	async #ClassActions(options) {
		if (!this.defaultActions.class) return;
		let commandArray = Utility.CommandArray(Utility.SplitStringPreserveQuotes(options.class), ["add", "remove"]);
		commandArray.forEach((c) => {
			// remove all
			if (c.values.length === 0 && c.command === "remove") {
				options.target?.forEach((t) => t.removeAttribute("class"));
				return;
			}
			switch (c.command) {
				case "add":
					options.target?.forEach((t) => t.classList.add(...c.values));
					break;
				case "remove":
					options.target?.forEach((t) => t.classList.remove(...c.values));
					break;
			}
		});
	}
	async #DelayActions(options) {
		if (this.defaultActions.delay) await Utility.Delay(options.delayTime, { skippable: options.delaySkip || false });
	}
	static Type = {
		Tag: 1,
		TextElement: 2,
		ChoiceElement: 3,
		AllElements: 4,
		TextRaw: 5,
		ChoiceRaw: 6,
		AllRaw: 7,
		Variable: 8,
	};
}
//#endregion

//#region passage
class Passage {
	array = [];
	indices = {};
	counts = {};
	#UpdateIndices() {
		Object.values(PassageObject.Type).forEach((key) => (this.indices[key] = -1));
		this.array.forEach((p, i) => (this.indices[p.type] = this.indices[p.type] >= 0 ? Math.min(this.indices[p.type], i) : i));
	}
	#UpdateCounts() {
		Object.values(PassageObject.Type).forEach((key) => (this.counts[key] = 0));
		this.array.forEach((p) => this.counts[p.type]++);
	}
	AddPassageObject(passageObject) {
		this.array.push(passageObject);
		this.#UpdateIndices();
		this.#UpdateCounts();
	}
	RemovePassageObject(passageObject) {
		this.array.splice(this.array.indexOf(passageObject), 1);
		this.#UpdateIndices();
		this.#UpdateCounts();
	}
	GetTarget(index) {
		return this.array[this.GetTargetIndex(index)];
	}
	GetTargetIndex(index) {
		if (this.indices[PassageObject.Type.Text] === -1 && this.indices[PassageObject.Type.Choice] === -1) return undefined;
		if (index <= this.indices[PassageObject.Type.Text]) return this.indices[PassageObject.Type.Text];
		return Math.max(this.indices[PassageObject.Type.Text], this.indices[PassageObject.Type.Choice]);
	}
}

class PassageObject {
	constructor(options) {
		this.type = options.type;
		if (this.type === PassageObject.Type.Tag && options.choiceTarget) this.choiceTarget = options.choiceTarget;
	}
	get compatibleProcessorTypes() {
		let types = [];
		switch (this.type) {
			case PassageObject.Type.Tag:
				types = [Processor.Type.Tag];
				break;
			case PassageObject.Type.Text:
				types = [Processor.Type.TextRaw, Processor.Type.AllRaw, Processor.Type.TextElement, Processor.Type.AllElements];
				break;
			case PassageObject.Type.Choice:
				types = [Processor.Type.ChoiceRaw, Processor.Type.AllRaw, Processor.Type.ChoiceElement, Processor.Type.AllElements];
				break;
			case PassageObject.Type.Newline:
				break;
		}
		return types;
	}
	// values for these keys are the same values that come out of inkjs
	static Type = {
		Tag: "tag",
		Text: "text",
		Choice: "choices",
		Newline: "newline",
	};
}
//#endregion

//#region utility
class Utility {
	// pinched from calico (thx elliot!)
	// and https://stackoverflow.com/q/56503531
	static BindFunctions(target) {
		Object.getOwnPropertyNames(Object.getPrototypeOf(target))
			.filter((method) => method !== "constructor")
			.forEach((method) => {
				target[method] = target[method].bind(target);
			});
	}
	// Returns true if it is a DOM element
	// pinched from https://stackoverflow.com/a/384380
	static IsElement(o) {
		if (typeof (HTMLElement === "object")) {
			return o instanceof HTMLElement;
		} else {
			return o && typeof o === "object" && o !== null && o.nodeType === 1 && typeof o.nodeName === "string";
		}
	}
	// pinched from https://stackoverflow.com/a/22753230
	static CreateElement(tag, attrs = {}) {
		var element = document.createElement(tag),
			attrName,
			styleName,
			dataAttr;
		if (attrs) {
			for (attrName in attrs) {
				if (attrName === "style") {
					for (styleName in attrs.style) {
						element.style[styleName] = attrs.style[styleName];
					}
				} else if (attrName === "dataset") {
					for (dataAttr in attrs.dataset) {
						element.dataset[dataAttr] = attrs.dataset[dataAttr];
					}
				} else {
					element[attrName] = attrs[attrName];
				}
			}
		}
		return element;
	}
	static async CheckURLOK(path) {
		try {
			const checkurl = await fetch(path, { method: "HEAD" });
			return { ok: checkurl.ok, total: parseFloat(checkurl.headers.get("content-length")) };
		} catch (error) {
			return { ok: false };
		}
	}
	// TODO: maybe this makes more sense as a class?
	// constructor takes the entire string, works out if it's relative or not, etc.
	static FilePathExtension(fullpath) {
		let indexOfDot = fullpath.lastIndexOf(".");
		let indexOfLastSlash = fullpath.lastIndexOf("/");
		return {
			path: fullpath.indexOf("/") !== -1 ? fullpath.substring(0, indexOfLastSlash + 1) : "",
			filename: indexOfDot !== -1 ? fullpath.substring(indexOfLastSlash + 1, indexOfDot) : fullpath.substring(indexOfLastSlash + 1),
			extension: indexOfDot !== -1 ? fullpath.substring(indexOfDot) : "",
		};
	}
	static ConvertToAbsolutePath(relativePath) {
		if (relativePath[0] === "/") return relativePath;
		let cleanPath = relativePath.slice(0, 2) === "./" ? relativePath.substring(2, relativePath.length) : relativePath;
		return Utility.FilePathExtension(window.location.pathname).path + cleanPath;
	}
	static DeduplicateArray(array) {
		return array.filter((element, index) => array.indexOf(element) === index);
	}
	static DeduplicateObjectArrayByKey(array, key) {
		return array.filter((e1, i, a) => a.findIndex((e2) => e2[key] === e1[key]) === i);
	}
	static RemoveElements(array, elementsToRemove) {
		if (!Array.isArray(elementsToRemove)) elementsToRemove = [elementsToRemove];
		return array.filter((element) => elementsToRemove.indexOf(element) < 0);
	}
	static SameContents(array1, array2) {
		return array1.every((a1item) => array2.includes(a1item)) && array2.every((a2item) => array1.includes(a2item));
	}
	static EscapeString(string) {
		// escaped backslash is at the start so it doesn't match any inserted ones
		const escapeCharacters = ["\\", "^", "$", ".", "*", "+", "?", "(", ")", "[", "]", "{", "}", "|", "/"];
		escapeCharacters.forEach((escapeCharacter) => {
			string = string.replaceAll(escapeCharacter, `\\${escapeCharacter}`);
		});
		return string;
	}
	// pinched from https://stackoverflow.com/a/30546115
	static CSSTimeToNumber(s) {
		return parseFloat(s) * (/\ds$/.test(s) ? 1000 : 1);
	}
	static NumberToCSSTime(n) {
		return parseFloat(n) + "ms";
	}
	static Debounce(callback, wait, leading = false) {
		let timeoutId = null;
		return (...args) => {
			if (!leading) {
				// trailing edge debounce
				window.clearTimeout(timeoutId);
				timeoutId = window.setTimeout(() => {
					callback.apply(null, args);
				}, wait);
			} else {
				// leading edge debounce
				if (!timeoutId) {
					callback.apply(null, args);
				}
				window.clearTimeout(timeoutId);
				timeoutId = window.setTimeout(() => {
					timeoutId = null;
				}, wait);
			}
		};
	}
	// expects an object with properties {variableName:variableValue}
	// element defaults to document root
	static AddCSSVariables(variables, element = document.documentElement) {
		for (const key of Object.keys(variables)) {
			element.style.setProperty(`--${key}`, variables[key]);
		}
	}

	// pinched from https://stackoverflow.com/a/37616104
	static ObjectFilter(obj, predicate) {
		return Object.fromEntries(Object.entries(obj).filter(predicate));
	}

	// returns a promise that resolves after x milliseconds
	static Delay(delay, options = { skippable: false, preventDefault: false, stopPropagation: false, stopImmediatePropagation: false }) {
		return new Promise((resolve) => {
			const delayController = new AbortController();
			const timeout = setTimeout(() => endDelay(), parseFloat(delay));
			const endDelay = () => {
				clearTimeout(timeout);
				delayController.abort();
				resolve();
			};
			if (options.skippable) InkRunner.instance.AddEvent("continue", { callback: endDelay, once: true });
		});
	}

	// takes a flat array of commands/parameters and returns them as an array of objects (commands and parameters)
	static CommandArray(commandArray, commands) {
		let result = [];
		if (commandArray.length > 0 && !commands.includes(commandArray[0])) {
			InkRunner.Error("First element of command array is not a valid command");
		}
		commandArray.forEach((element) => {
			if (commands.includes(element.trim())) {
				result.splice(result.length, 0, { command: element.trim(), values: [] });
				return;
			}
			result[result.length - 1].values.push(element.trim());
		});
		return result;
	}

	// takes a space separated string and splits it into an array, but preserves quotes and apostrophes
	static SplitStringPreserveQuotes(string) {
		const regex = /(["'`])[^<>:\\|?*\n\r]+?\1|[^<>:\\|?*\s"`]+/g;
		let array = [];
		string = string.replaceAll("\\", "");
		for (const match of string.matchAll(regex)) {
			let value = match[0].trim().replaceAll(/^["'`]{1}|["'`]{1}$/g, "");
			value = /^[\d.]*$/g.test(value) ? parseFloat(value) : value;
			value = /^true|false$/g.test(value) ? (value === true ? true : false) : value;
			array.push(value);
		}
		return array;
	}

	static ObjectEqualityShallow(a, b) {
		const aKeys = Object.keys(a);
		const bKeys = Object.keys(b);

		if (aKeys.length !== bKeys.length) return false;
		if (aKeys.some((key) => aKeys[key] !== bKeys[key])) return false;
		return true;
	}

	static ObjectEqualityDeep(a, b) {
		const aKeys = Object.keys(a);
		const bKeys = Object.keys(b);

		if (aKeys.length !== bKeys.length) return false;

		for (const key of aKeys) {
			if (this.IsObject(a[key]) && this.IsObject(b[key]) && this.ObjectEqualityDeep(a[key], b[key])) return false;
			if (!(this.IsObject(a[key]) && this.IsObject(b[key])) && a[key] !== b[key]) return false;
		}

		return true;
	}

	static IsObject(object) {
		return object != null && typeof object === "object";
	}
}
//#endregion

export { InkRunner, Processor, Utility, Passage, PassageObject };
// i'm importing this dynamically in inkLoader.js and i can't tell
// which modules we're exporting... so i return them as an array
export function preload() {
	return ["InkRunner", "Utility", "Processor", "Passage", "PassageObject"];
}
