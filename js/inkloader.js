// TODO: give this a once over and rewrite
// issues:
// 1. importing modules is pretty shakey
//    it breaks code completion, it's a bit weird to import them on the user side
// 2. relies on specific download/import order
//    story, inkjs, modules, assets

// import { InkRunner } from "./inkrunner.js";

export class InkLoader {
	storyPath = "";
	options = {};
	preloadProcessors = [];
	preloadFiles = [];
	modules = {};
	/**
	 * @param {string} storyPath - Path to story (ink or json)
	 * @param {Object} options - InkRunner options
	 * @param {Array} preloadProcessors - Paths to processor js files
	 * @param {Array} preloadFiles - Other files to force preload
	 */
	constructor(storyPath, options = {}, preloadProcessors = [], preloadFiles = []) {
		if (!storyPath) throw new Error("No story path provided.");
		this.storyPath = storyPath;
		this.options = options;
		this.preloadProcessors = preloadProcessors;
		this.preloadFiles = preloadFiles;
	}
	async Load() {
		// create ui and update function
		const progressContainer = document.createElement("div");
		progressContainer.style.opacity = 1;
		progressContainer.dataset.irRole = "progressContainer";
		const progressBar = Object.assign(document.createElement("div", { role: "progressbar", ariaLabel: "Loading:", ariaValuemin: 0, ariaValuemax: 100, ariaValuenow: 0 }));
		progressBar.dataset.irRole = "progressBar";
		progressContainer.append(progressBar);
		document.body.append(progressContainer);

		// update aria value and css progress variables
		const updateLoadingUI = (progress) => {
			progressBar.ariaValuenow = parseFloat(progress);
			progressContainer.style.setProperty("--progressPercent", parseFloat(progress) + "%");
			progressContainer.style.setProperty("--progressDegrees", parseFloat(progress) * 3.6 + "deg");
			progressContainer.style.setProperty("--progressFloat", parseFloat(progress) / 100);
		};

		const closeLoadingUI = async (fadeout) => {
			progressContainer.style.transition = `opacity linear ${fadeout}ms 250ms`;
			setTimeout(() => (progressContainer.style.opacity = 0), 1);
			return new Promise((resolve) =>
				setTimeout(() => {
					progressContainer.remove();
					resolve();
				}, fadeout + 250 + 1)
			);
		};

		// preload inkrunner & processors
		let initialPreloadFiles = [this.storyPath.trim(), "./js/inkrunner.js"];
		if (this.preloadProcessors) initialPreloadFiles.push(...this.preloadProcessors);
		if (this.options.inkPath) initialPreloadFiles.push(this.options.inkPath);
		for (let i = 0; i < initialPreloadFiles.length; i++) {
			initialPreloadFiles[i] = new URL(initialPreloadFiles[i].trim(), document.baseURI).pathname;
		}

		let initialPreloadCheckPromises = [];
		initialPreloadFiles.forEach((path) => {
			initialPreloadCheckPromises.push(
				fetch(path, { method: "HEAD" }).then((res) => {
					if (!res.ok) throw new Error(`InkLoader: Tried to load non-existent module or story at "${path}"`);
				})
			);
		});

		// create initial preloader and progress event
		const initialPreloader = Preload();
		let initialPreloadSize = 0;
		initialPreloader.onfetched = (event) => (initialPreloadSize += event.total);
		initialPreloader.oncomplete = () => {
			if (this.options.debug) console.log("InkLoader: Modules preload complete");
		};

		// when all initial files return OK, fetch them
		let initialPreloadPromise;
		await Promise.all(initialPreloadCheckPromises).then(() => {
			initialPreloadPromise = initialPreloader.fetch(initialPreloadFiles);
		});

		await Promise.resolve(initialPreloadPromise);

		// dynamic module loading!!!!
		let modulePromises = [];
		for await (const file of initialPreloadFiles) {
			if (file.slice(-3) === ".js") {
				if (file.slice(-12) === "inkrunner.js") {
					modulePromises.push(
						new Promise(async (resolve) => {
							let keys = (await import(file)).preload();
							for (const key of keys) {
								({ [key]: this.modules[key] } = await import(file));
							}
							resolve();
						})
					);
				} else {
					modulePromises.push(import(file));
				}
			}
		}

		// wait until they're all imported
		await Promise.all(modulePromises);
		if (this.options.debug) console.log("InkLoader: Imported modules");
		const Utility = this.modules.Utility;

		// create inkrunner instance and load the story
		const inkrunner = new this.modules.InkRunner(this.storyPath, this.options);

		// load inkjs runtime
		await inkrunner.LoadInkjs();

		// load story json (compile if required)
		// if you're not loading files and you're compiling an .ink file, this takes a sec
		let storyJson;
		switch (Utility.FilePathExtension(this.storyPath).extension) {
			case ".ink":
				if (this.options.debug) console.log("InkLoader: ink file detected - compiling...");
				storyJson = await inkrunner.CompileStory(this.storyPath);
				break;
			case ".json":
				if (this.options.debug) console.log("InkLoader: precompiled json file detected");
				if (inkjs.Compiler) console.warn("InkLoader: loading .json story but supplied inkjs contains compiler. Use the smaller ink.js file for faster load times!");
				storyJson = await inkrunner.CreateStoryString(this.storyPath);
				break;
			default:
				throw new Error(`InkLoader: can't load "${this.storyPath}" - extension not recognised`);
		}

		// preload story assets and preload files
		let assetPreloadCheck = [];
		let assetPreloadCheckPromises = [];
		let assetPreloadFiles = [];

		// categorise manually preloaded files
		this.preloadFiles.forEach((path) => {
			let type = "unknown";
			let filename = Utility.FilePathExtension(path).filename;
			let filepath = Utility.FilePathExtension(path).path;
			let filetype = Utility.FilePathExtension(path).extension;
			Object.values(inkrunner.tagTypes).forEach((tagtype) => {
				if (tagtype.extensions.includes(filetype)) type = tagtype.type;
			});
			if (type === "unknown")	filename = filename + filetype;
			assetPreloadCheck.push({ name: filename, path: filepath + filename, type: type });
		});

		// find all matches of above tags in the provided ink json
		// split them into path, filename, and extension
		// if an extension isn't provided, add all possible permutations based on extensions provided by tag
		// add the file to a list of files to be checked
		// thanks again elliot for da regex 🙇
		let tags = [];
		if (Object.keys(inkrunner.tagTypes).length !== 0) {
			Object.values(inkrunner.tagTypes).forEach((tagtype) => tags.push(...tagtype.tags));
			for (const match of storyJson.matchAll(new RegExp(`"#","\\^((${tags.join("|")}).*?)","\\/#"`, "gi"))) {
				let tagObject = inkrunner.ProcessTagString(match[1].replaceAll("\\", ""));
				if (tagObject === undefined) continue;
				let tagType = Object.entries(inkrunner.tagTypes).find(([key, value]) => value.tags.includes(tagObject.name))[1];

				// loop through each value, append a path, then add the path to array to be checked
				tagObject.value.forEach((value) => {
					if (tagType.ignoreStrings && tagType.ignoreStrings.includes(value)) return;
					let path = Utility.FilePathExtension(value).path;
					if (path[0] !== "/" && !path.startsWith(tagType.path)) path = tagType.path + path;
					path = Utility.ConvertToAbsolutePath(path); // just in case

					// split the string into file name and extension
					let file = Utility.FilePathExtension(value).filename;
					let exts = Utility.FilePathExtension(value).extension !== "" ? [Utility.FilePathExtension(value).extension] : tagType.extensions;
					exts.forEach((ext) => {
						let type = tagType.type ? tagType.type : "unknown";
						let url = new URL(path + file + ext, document.baseURI).pathname;
						assetPreloadCheck.push({ name: value, path: url, type: type });
					});
				});
			}
		}

		// create promise array to go through files (and possible extensions)
		// and check if they're okay (i.e. return HTTP 200)
		if (this.options.debug) console.log("InkLoader: looking for files referenced in story (404s are normal, it's looking for file variants)");
		let assetPreloadSize = 0;
		assetPreloadCheck = Utility.DeduplicateObjectArrayByKey(assetPreloadCheck, "path");
		assetPreloadCheck.forEach((file) => {
			assetPreloadCheckPromises.push(
				Utility.CheckURLOK(file.path).then((res) => {
					if (res.ok) {
						assetPreloadSize += res.total;
						assetPreloadFiles.push(file);
					}
				})
			);
		});

		// set up asset preloader and progress event
		const assetPreloader = Preload();
		let fileCheckPromises = [];
		let preloadProgress = initialPreloadSize;
		assetPreloader.onprogress = (event) => {
			const file = assetPreloadFiles.find((file) => file.path === event.item.url);
			let lastDownloaded = file.downloaded ? file.downloaded : 0;
			file.downloaded = event.item.downloaded;
			preloadProgress += file.downloaded - lastDownloaded;
			updateLoadingUI((preloadProgress / (initialPreloadSize + assetPreloadSize)) * 100);
			if (event.item.completion === 100) {
				delete file.downloaded;
				let fileCheck = inkrunner.tagTypes[file.type]?.fileCheck;
				if (fileCheck) fileCheckPromises.push({ path: file.path, promise: fileCheck(file) });
			}
		};

		let assetPreloadPromise;
		await Promise.all(assetPreloadCheckPromises);
		if (this.options.debug) console.log("InkLoader: Asset download list compiled");
		if (!this.options.debug) console.clear();
		if (assetPreloadFiles.length > 0) assetPreloadPromise = assetPreloader.fetch(assetPreloadFiles.map((file) => file.path));

		// wait for all files to preload
		await Promise.resolve(assetPreloadPromise);
		if (this.options.debug) console.log("InkLoader: Asset preload complete");

		// await image width/height check
		await Promise.all(fileCheckPromises.map((e) => e.promise));
		if (this.options.debug) console.log("InkLoader: Asset metadata check complete");
		inkrunner.externalFiles = assetPreloadFiles;
		if (this.options.verbose) console.log("InkLoader: Assets", inkrunner.externalFiles);

		// all done!
		updateLoadingUI(100);
		if (this.options.debug) console.log("InkLoader: Preload complete");
		window.dispatchEvent(new CustomEvent("PreloadComplete"), { detail: { files: assetPreloadFiles } });
		await closeLoadingUI(250);
		await inkrunner.LoadStory(storyJson);
		return this.modules.InkRunner.instance;
	}
}

/**
 * preload-it v1.4.0
 * (c) 2018 Andreu Pifarre
 * MIT License
 * https://github.com/andreupifarre/preload-it
 */
// prettier-ignore
function Preload(t) {return {state: [],loaded: !1,stepped: (t && t.stepped) || !0,onprogress: () => {},oncomplete: () => {},onfetched: () => {},onerror: () => {},oncancel: () => {},fetch: function (t) {return new Promise((e, o) => {this.loaded = t.length;for (let o of t)this.state.push({ url: o }),this.preloadOne(o, (t) => {this.onfetched(t);this.loaded--;0 == this.loaded && (this.oncomplete(this.state), e(this.state));});});},updateProgressBar: function (t) {let e = 0,o = this.stepped ? 100 * this.state.length : 0,n = 0;for (const t of this.state) t.completion && n++, this.stepped ? t.completion && (e += t.completion) : this._readyForComputation ? ((e += t.downloaded), (o += t.total)) : (e = o = 0);this._readyForComputation = n == this.state.length;const s = parseInt((e / o) * 100);isNaN(s) || this.onprogress({ progress: s, item: t });},preloadOne: function (t, e) {const o = new XMLHttpRequest();o.open("GET", t, !0), (o.responseType = "blob");const n = this.getItemByUrl(t);(n.xhr = o),(o.onprogress = (t) => {if (!t.lengthComputable) return !1;n.completion = parseInt((t.loaded / t.total) * 100);n.downloaded = t.loaded;n.total = t.total;this.updateProgressBar(n);}),(o.onload = (t) => {const s = t.target.response.type;const r = t.target.responseURL;n.fileName = r.substring(r.lastIndexOf("/") + 1);n.type = s;n.status = o.status;if (404 == o.status) (n.blobUrl = n.size = null), (n.error = !0), this.onerror(n);else {const e = new Blob([t.target.response], { type: s });(n.blobUrl = URL.createObjectURL(e)), (n.size = e.size), (n.error = !1);}e(n);}),o.send();},getItemByUrl: function (t) {for (var e of this.state) if (e.url == t) return e;},cancel: function () {for (var t of this.state) t.completion < 100 && (t.xhr.abort(), (t.status = 0));return this.oncancel(this.state), this.state;},};}
