/*******************************************************************************
 * @license
 * Copyright (c) 2016, 2017 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License v1.0
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html).
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
 /*eslint-env amd, browser*/
define([
	"orion/Deferred",
	"js-yaml/js-yaml",
	"orion/util"
], function(Deferred, JsYaml, Util) {

	var eslintHandler = {
		_update: function _update(project, fileName) {
			if(project.lintFiles.indexOf(fileName) > -1) {
				delete project.map.eslint;
			} else if (fileName === project.JSBEAUTIFYRC) {
				delete project.map.formatting;
			}
		},
		/**
		 * @callback
		 */
		onModified: function onModified(project, qualifiedName, fileName) {
			this._update(project, fileName);
		},
		/**
		 * @callback
		 */
		onDeleted: function onDeleted(project, qualifiedName, fileName) {
			this._update(project, fileName);
		},
		/**
		 * @callback
		 */
		onCreated: function onCreated(project, qualifiedName, fileName) {
			this._update(project, fileName);
		},
		/**
		 * @callback
		 */
		onMoved: function onMoved(project, qualifiedName, fileName, toQualified, toName) {
			this._update(project, fileName);
		},
		/**
		 * @callback
		 */
		onProjectChanged: function onProjectChanged(project, evnt, projectName) {
			delete project.map.eslint;
			delete project.map.formatting;
		}
	};

	/**
	 * @description This handler updates the 'env' map.
	 * @type {?}
	 * @since 14.0
	 */
	var envHandler = {
		/**
		 * @callback
		 */
		onCreated: function onCreated(project, qualifiedName, fileName) {
			//We can read the new files and update here, but that could take longer than 
			//would be ready for the next getComputedEnvironment call - just wipe the cache
			//and recompute when asked for
			this._wipeCache(project, qualifiedName, fileName);
		},
		/**
		 * @callback
		 */
		onDeleted: function onDeleted(project, qualifiedName, fileName) {
			//We don't have access to the deleted contents - wipe the cache and recompute when asked for
			this._wipeCache(project, qualifiedName, fileName);
		},
		/**
		 * @callback
		 */
		onModified: function onModified(project, qualifiedName, fileName) {
			//same problem with onCreated - we could compute the delta, but that could take longer 
			//and not be complete by the next onComputedEnvironment call, which would cause sync issues
			//just wipe the cache
			this._wipeCache(project, qualifiedName, fileName);
		},
		/**
		 * @callback
		 */
		onProjectChanged: function onProjectChanged(project, evnt, projectName) {
			delete project.map.env;
		},
		/**
		 * @name _wipeCache
		 * @description Clears the 'env' cache if the file name is a project configuration-like file
		 * @function
		 * @private
		 * @param {JavaScriptProject} project The backing project
		 * @param {String} qualifileName The fully qualified name of the file
		 * @param {String} fileName The short name of the file, i.e. 'package.json'
		 */
		_wipeCache: function _wipeCache(project, qualifileName, fileName) {
			if(fileName === project.PACKAGE_JSON || fileName === project.NODE_MODULES || 
				project.lintFiles.indexOf(fileName) > -1 || fileName === project.TERN_PROJECT) {
					delete project.map.env;
			}
			var folderPath = project.getProjectPath()+project.DEFINITIONS;
			if(qualifileName === folderPath || qualifileName.indexOf(folderPath) === 0) {
				delete project.map.env;
			}
		} 
	};
	
	var initialized = false;

	/**
	 * @description Creates a new JavaScript project
	 * @constructor
	 * @public
	 * @param {ServiceRegistry} serviceRegistry The service registry
	 * @since 12.0
	 */
	function JavaScriptProject(serviceRegistry) {
		this.projectMeta = null;
		this.map = Object.create(null);
		this.registry = serviceRegistry;
		this.fileClient = null;
		this.handlers = [eslintHandler, envHandler];
        this.lintFiles = [this.ESLINTRC_JS, this.ESLINTRC_JSON, this.ESLINTRC, this.ESLINTRC_YAML, this.ESLINTRC_YML, this.PACKAGE_JSON];
		this.projectFiles = [this.PACKAGE_JSON, this.TERN_PROJECT].concat(this.lintFiles);
	}
	/**
	 * The .tern-project file name
	 */
	JavaScriptProject.prototype.TERN_PROJECT = '.tern-project';
	/**
	 * The .eslintrc file name
	 * @see http://eslint.org/docs/user-guide/configuring#configuration-file-formats
	 */
	JavaScriptProject.prototype.ESLINTRC = '.eslintrc';
	/**
	 * The .eslintrc.js file name
	 * @see http://eslint.org/docs/user-guide/configuring#configuration-file-formats
	 */
	JavaScriptProject.prototype.ESLINTRC_JS = '.eslintrc.js';
	/**
	 * The .eslintrc.yaml file name
	 * @see http://eslint.org/docs/user-guide/configuring#configuration-file-formats
	 */
	JavaScriptProject.prototype.ESLINTRC_YAML = '.eslintrc.yaml';
	/**
	 * The .eslintrc.yml file name
	 * @see http://eslint.org/docs/user-guide/configuring#configuration-file-formats
	 */
	JavaScriptProject.prototype.ESLINTRC_YML = '.eslintrc.yml';
	/**
	 * The .eslintrc.json file name
	 * @see http://eslint.org/docs/user-guide/configuring#configuration-file-formats
	 */
	JavaScriptProject.prototype.ESLINTRC_JSON = '.eslintrc.json';
	/**
	 * The project.json file name
	 */
	JavaScriptProject.prototype.PROJECT_JSON = 'project.json';
	/**
	 * The package.json file name
	 */
	JavaScriptProject.prototype.PACKAGE_JSON = 'package.json';
	/**
	 * The jsconfig.json file name
	 */
	JavaScriptProject.prototype.JSCONFIG_JSON = 'jsconfig.json';
	/**
	 * The node_modules folder name
	 */
	JavaScriptProject.prototype.NODE_MODULES = 'node_modules';
	/**
	 * The .jsbeautifyrc file name
	 * @see https://github.com/beautify-web/js-beautify/blob/master/README.md
	 */
	JavaScriptProject.prototype.JSBEAUTIFYRC = '.jsbeautifyrc';
	/**
	 * The .definitions folder name
	 * @since 14.0
	 */
	JavaScriptProject.prototype.DEFINITIONS = '.definitions';
	/**
	 * @description Adds a handler for the given file name to the mapping of handlers
	 * @function
	 * @param {Object} functions The object map of functions
	 */
	JavaScriptProject.prototype.addHandler = function addHandler(functions) {
		this.handlers.push(functions);
	};

	/**
	 * @description Returns the current project path
	 * @function
	 * @returns {String} The current project path or null if there is no project context
	 */
	JavaScriptProject.prototype.getProjectPath = function getProjectPath() {
		if(this.projectMeta) {
			return this.projectMeta.Location;
		}
		return null;
	};

	/**
	 * @description Returns the current ECMA version being used in the project, or the default of 6
	 * @function
	 * @returns {Number} The project ECMA level or the default of 6
	 */
	JavaScriptProject.prototype.getEcmaLevel = function getEcmaLevel() {
		if(this.ecma > 4 && this.ecma < 8) {
			return new Deferred().resolve(this.ecma);
		}
		return this.getFile(this.TERN_PROJECT).then(function(file) {
			this.ecma = 6;
			if(file) {
				try {
					var v = JSON.parse(file.contents);
					if(v.ecmaVersion > 4 && v.ecmaVersion < 8) {
						this.ecma = v.ecmaVersion;
					}
				} catch(err) {
					this.ecma = 6;
				}
			}
			return this.ecma;
		}.bind(this));
	};

	/**
	 * @description Fetch the named child of the current project context
	 * @function
	 * @param {String} childName The short name of the project child to get
	 * @param {String} projectPath The optional project path to fetch from
	 * @returns {Deferred} A deferred that will resolve to the requested child metadata or null
	 */
	JavaScriptProject.prototype.getFile = function getFile(childName, projectPath) {
		if(!this.projectMeta && !projectPath) {
			return new Deferred().resolve(null);
		}
		var _project = this.projectMeta ? this.projectMeta.Location : projectPath;
		var filePath = _project+childName;
		if(this.map[filePath]) {
			return new Deferred().resolve(this.map[filePath]);
		}
		return this.getFileClient().read(filePath, false, false, {readIfExists: true}).then(function(child) {
			if(child !== null) {
	            this.map[filePath] = {name: filePath, contents: child, project: _project};
	            return this.map[filePath];
	        }
			return null;
		}.bind(this),
		function rejected() {
			return null;
		});
	};
	
	/**
	 * @description Fetch the children of the named child folder of the current project context
	 * @function
	 * @param {String} childName The short name of the project child to get
	 * @param {String} projectPath The optional project path to fetch from
	 * @returns {Deferred} A deferred that will resolve to the requested child metadata or null
	 * @since 14.0
	 */
	JavaScriptProject.prototype.getFolder = function getFolder(childName, projectPath) {
		if(!this.projectMeta && !projectPath) {
			return new Deferred().resolve(null);
		}
		var _project = this.projectMeta ? this.projectMeta.Location : projectPath;
		var folderPath = _project+childName;
		return this.getFileClient().fetchChildren(folderPath, {readIfExists: true}).then(function(children) {
            return children;
		},
		function rejected() {
			return [];
		});
	};

	JavaScriptProject.prototype.initFrom = function initFrom(path) {
		if(!initialized) {
			initialized = true;
			return this.getFileClient().read(path, true, false, {readIfExists: true}).then(function(child) {
				if(child) {
					this.onInputChanged({file: child});
				}
			}.bind(this));
		}
		return new Deferred().resolve();
	};

	/**
	 * @description Update the contents of the given file name, and optionally create the file if it does not exist.
	 * NOTE: this function does not check for existig values or duplicate entries, those checks must be done prior to calling
	 * this function with the JSON values to merge
	 * @function
	 * @param {String} childName The short name of the project child to get
	 * @param {Boolean} create If the file should be created if it does not exist
	 * @param {Object} values The object of values to mix-in to the current values for a file.
	 */
	JavaScriptProject.prototype.updateFile = function updateFile(childName, create, values) {
		if(this.projectMeta) {
			return this.getFile(childName).then(function(child) {
				var contents = child ? child.contents : null;
				if(typeof contents === 'string') {
					var json;
					if (contents.length) {
						json = JSON.parse(contents);
						_merge(values, json);
					} else {
						json = values;
					}
					return this.getFileClient().write(this.projectMeta.Location+childName, JSON.stringify(json, null, '\t'));
				} else if(create) {
					return this.getFileClient().createFile(this.projectMeta.Location, childName).then(function(file) {
						json = _defaultsFor(childName);
						if(json) {
							_merge(json, values);
						}
						return this.getFileClient().write(file.Location, JSON.stringify(values, null, '\t'));
					}.bind(this));
				}
			}.bind(this));
		}
	};

	/**
	 * @description Get the defaults used when creating a new tracked file
	 * @private
	 * @param {String} filename The name of tracked file to create
	 * @returns {{}|null} An object of default values or null
	 * @since 13.0
	 */
	function _defaultsFor(filename) {
		switch(filename) {
			case JavaScriptProject.prototype.TERN_PROJECT: {
				var json = Object.create(null);
				json.ecmaVersion = 6;
				json.libs = ['ecma5', 'ecma6'];
				json.plugins = Object.create(null);
				json.loadEagerly = [];
				return json;
			}
			default:
				return null;
		}
	}

	function _merge(source, dest) {
		Object.keys(source).forEach(function(key) {
			if(Array.isArray(dest[key]) && Array.isArray(source[key])) {
				dest[key] = [].concat(dest[key], source[key]);
			} else if(typeof dest[key] === 'object' && dest[key] !== null) {
				source[key] = source[key] || Object.create(null);
				_merge(source[key], dest[key]);
			} else {
				dest[key] = source[key];
			}
		});
	}

	/**
	 * @name JavaScriptProject.prototype.getFileClient
	 * @description Returns the file client to use
	 * @function
	 * @returns {orion.FileClient} The file client
	 */
	JavaScriptProject.prototype.getFileClient = function getFileClient() {
		if(!this.fileClient) {
			this.fileClient = this.registry.getService("orion.core.file.client"); //$NON-NLS-1$
		}
		return this.fileClient;
	};

	/**
	 * @name JavaScriptProject.prototype.getESlintOptions
	 * @description Returns project-specific eslint options (if any)
	 * @function
	 * @returns {Deferred} A deferred that will resolve to the project-specific eslint options or null
	 * @see http://eslint.org/docs/user-guide/configuring
	 */
	JavaScriptProject.prototype.getESlintOptions = function getESlintOptions() {
        var deferred = new Deferred();
		if(this.map.eslint) {
			return deferred.resolve(this.map.eslint);
		}
        
        var p = [];
        this.lintFiles.forEach(function(_name) {
            p.push(this.getFile(_name));
        }.bind(this));
        p.reduce(function(prev, current, index, array) {
            return prev.then(function(_file) {
            	if(_file && _file.contents) {
                    var vals = readAndMap(this.map, _file, "eslint", this);
                    if(vals) {
                        deferred.resolve(vals);
                        return current.reject("done");
                    }
                }
                if(index === array.length-1) {
                    deferred.resolve(null);
                }
                return current;
            }.bind(this));
        }.bind(this), new Deferred().resolve());
        return deferred;
	};

	/**
	 * @name JavaScriptProject.prototype.getFormattingOptions
	 * @description Returns project-specific formatting options (if any)
	 * @function
	 * @returns {Deferred} A deferred that will resolve to the project-specific formatting options or null
	 * @see https://github.com/beautify-web/js-beautify
	 */
	JavaScriptProject.prototype.getFormattingOptions = function getFormattingOptions() {
		if(this.map.formatting) {
			return new Deferred().resolve(this.map.formatting);
		}
		return this.getFile(this.JSBEAUTIFYRC).then(function(file) {
			if(file && file.contents) {
				return readAndMap(this.map, file, "formatting", this);
			}
			return null;
		}.bind(this));
	};
	
	/**
	 * @name JavaScriptProject.prototype.importantChange
	 * @description Returns if the file changed was an important change requiring a Tern restart
	 * @function
	 * @param {String} qualifiedName The fully qualified name of the changed file
	 * @param {String} filename The name of the changed file
	 * @returns {Boolean} True if an important project configuration file has changed
	 * @since 14.0
	 */
	JavaScriptProject.prototype.importantChange = function importantChange(qualifiedName, filename) {
		if(this.projectFiles.indexOf(filename) > -1) {
			return true;
		}
		var folderPath = this.getProjectPath()+this.DEFINITIONS;
		return qualifiedName === folderPath || qualifiedName.indexOf(folderPath) === 0;
	};

	/**
	 * @name JavaScriptProject.prototype.getComputedEnvironment
	 * @description Computes the environment that has been computed based on what config files are in the project
	 * @function
	 * @returns {Deferred} A deferred that will resolve to an object listing the computed environments to use in the tools
	 * @since 14.0
	 */
	JavaScriptProject.prototype.getComputedEnvironment = function getComputedEnvironment() {
		if(this.map.env) {
			return new Deferred().resolve(this.map.env);
		}
		return this.projectPromise.then(function() {
			this.map.env = {};
			this.map.env.envs = {browser: true, node: true}; //always start assuming browser
			//start with eslint options - they can carry env objects
			return this.getESlintOptions().then(function(options) {
				this.map.env.eslint = options;
				if(options && options.vals && options.vals.env) {
					Object.keys(options.vals.env).forEach(function(key) {
						this.map.env.envs[key] = options.vals.env[key];
					}.bind(this));
				}
				return guessEnvForProject(this);
			}.bind(this));
		}.bind(this));
	};

	/**
	 * @name guessEnvForProject
	 * @description Looking at what files are available and whats in them, guess at the current project environment
	 * @param {JavaScriptProject} project The project object
	 * @returns {Deferred} a deferred to resolve the environment
	 * @since 14.0
	 */
	function guessEnvForProject(project) {
		return project.getFile(project.TERN_PROJECT).then(function(file) {
			project.map.env.ternproject = {file: file, vals: null};
			if(file && typeof file.contents === "string") {
				try {
					var vals = JSON.parse(file.contents);
					project.map.env.ternproject.vals = vals;
					if(Array.isArray(vals.libs)) {
						if(vals.libs.indexOf("browser") > -1) {
							project.map.env.envs.browser = true;
						} else if(vals.libs.indexOf("ecma6") > -1) {
							project.map.env.envs.es6 = true;
						} 
					}
					if(Array.isArray(vals.defs)) {
						if(vals.defs.indexOf("browser") > -1) {
							project.map.env.envs.browser = true;
						} else if(vals.defs.indexOf("ecma6") > -1) {
							project.map.env.envs.es6 = true;
						} 
					}
					if(vals.plugins && typeof vals.plugins === 'object') {
						if(vals.plugins.node) {
							project.map.env.envs.node = true;
						} else if(Object.keys(vals.plugins).length > 0) {
							//remove node as a default if there are other plugins specified
							//We will re-add it later when we look for other cues, like package.json
							delete project.map.env.envs.node;
						}
						if(vals.plugins.requirejs || vals.plugins.commonjs) {
							project.map.env.envs.amd = true;
							project.map.env.envs.browser = true;
						}
						if(vals.plugins.es6_modules) {
							project.map.env.envs.es6 = true;
							project.map.env.envs.browser = true;
							project.map.env.envs.node = true;
						}
					} 
					if(typeof vals.ecmaVersion === 'number') {
						if(vals.ecmaVersion >= 6) {
							project.map.env.envs.es6 = true;
						}
					} 
					if(vals.sourceType === 'modules') {
						project.map.env.envs.es6 = true;
						project.map.env.envs.browser = true;
						project.map.env.envs.node = true;
					}
				} catch (e) {
					// ignore, bad JSON
				}
			}
			return project.getFile(project.PACKAGE_JSON).then(function(file) {
				project.map.env.packagejson = {file: file};
				if(file && typeof file.contents === "string") {
					try {
						vals = project.map.env.packagejson.vals = JSON.parse(file.contents);
						if(vals) {
							if(vals.dependencies) {
								Object.keys(vals.dependencies).forEach(function(key) {
									project.map.env.envs[key] = true;
								});
							} else if(vals.devDependencies) {
								Object.keys(vals.dependencies).forEach(function(key) {
									project.map.env.envs[key] = true;
								});
							} else if(vals.optionalDependencies) {
								Object.keys(vals.dependencies).forEach(function(key) {
									project.map.env.envs[key] = true;
								});
							}
						}
					} catch(e) {
						//ignore
					}
					project.map.env.envs.node = true;
				}
				return project.getFolder(project.DEFINITIONS).then(function(children) {
					if(children.length > 0) {
						project.map.env.defs = [];
						children.forEach(function(def) {
							project.map.env.defs.push(project.DEFINITIONS+'/'+def.Name);
						});
					}
					return project.map.env;
				}, function rejected() {
					return project.map.env;
				});
			});
		});
	}

	/**
	 * @description Attempts to read the given file contents, parse it based on its type and cache it using the given key
	 * @param {?} map The project cache
	 * @param {?} file The file object from the file client
	 * @param {String} key The key to map to
	 * @param {JavaScriptProject} project The project context
	 * @returns {?} The parsed cache value
	 */
	function readAndMap(map, file, key, project) {
		map[key] = {file: file, vals: null};
		switch(file.name.slice(file.name.lastIndexOf('/')+1)) {
			case project.ESLINTRC:
			case project.ESLINTRC_JSON: {
				try {
					map[key].vals = JSON.parse(file.contents);
				} catch(err) {
					//ignore, bad JSON
				}
				break;
			}
			case project.PACKAGE_JSON: {
				try {
					var v = JSON.parse(file.contents);
					if(v && v.eslintConfig && typeof v.eslintConfig === "object") {
						map[key].vals = v.eslintConfig;
					}
				} catch(err) {
					//ignore, bad JSON
				}
				break;
			}
			case project.ESLINTRC_YAML:
			case project.ESLINTRC_YML: {
				try {
					map[key].vals = JsYaml.safeLoad(file.contents);
				} catch (e) {
					// ignore, bad YAML/YML
				}
				break;
			}
			case project.ESLINTRC_JS: {
				//TODO how should we load JS from an arbitrary file?
				//we can't eval them and we can't require them
				break;
			}
		}
		if (map[key].vals) {
			return map[key];
		}
		return null;
	}

	/**
	 * @name JavaScriptProject.prototype.hasNodeModules
	 * @description Returns if the current project context has a node_modules folder in it or not
	 * @function
	 * @returns {bool} If the project context has a node_modules folder
	 * @since 14.0
	 */
	JavaScriptProject.prototype.hasNodeModules = function hasNodeModules() {
		return Boolean(this._node_modules);
	};

	/**
	 * Callback from the orion.edit.model service
	 * @param {Object} evnt An <tt>orion.edit.model</tt> event.
	 * @see https://wiki.eclipse.org/Orion/Documentation/Developer_Guide/Plugging_into_the_editor#orion.edit.model
	 */
	JavaScriptProject.prototype.onInputChanged = function onInputChanged(evnt) {
		initialized = true;
		var file = evnt.file;
		resolveProject.call(this, file).then(function(project) {
			if (project) {
				if(!this.projectMeta || project.Location !== this.projectMeta.Location) {
					this.projectMeta = project;
					delete this.ecma;
					delete this.map[this.TERN_PROJECT];
					delete this._node_modules;
					return this.getFile(this.NODE_MODULES).then(function(file) {
							if(file && typeof file.contents === "string") {
								this._node_modules = true;
							}
							_handle.call(this, "onProjectChanged", this, evnt, project.Location);
							this.projectPromise.resolve(project);
						}.bind(this),
						/* @callback */ function(err) {
							_handle.call(this, "onProjectChanged", this, evnt, project.Location);
							this.projectPromise.resolve(project);
						}.bind(this));
				}
				_handle.call(this, "onInputChanged", this, evnt, project.Location);
				this.projectPromise.resolve(project);
			} else {
				delete this.ecma;
				_handle.call(this, "onProjectChanged", this, evnt, null);
				this.projectPromise.resolve(null);
			}
		}.bind(this));
	};

	/**
	 * @name resolveProject
	 * @description Tries to find the project context based on where we are in the source tree
	 * @param {?} file The file object from the resource navigator
	 * @returns {?} The project context or null
	 * @since 14.0
	 */
	function resolveProject(file) {
		var deferred = new Deferred();
        this.projectPromise = new Deferred();
		if(file) {
            var floc = file.Location ? file.Location : file.location; 
			if(this.projectMeta && floc && floc.startsWith(this.projectMeta.Location)) {
				deferred.resolve(this.projectMeta);
				return deferred;
			}
			var parents = file.parents ? file.parents : file.Parents;
			if(!Array.isArray(parents) || parents.length < 1) {
				deferred.resolve({Location: "/file/"});
			} else {
				this.getFileClient().getProject(floc, {names: [this.PACKAGE_JSON, this.TERN_PROJECT]}).then(function(project) {
					if(project) {
						return deferred.resolve({Location: project.Location});
					}
					fallbackProjectResolve.call(this, deferred, parents);
				}.bind(this), /* @callback */ function reject(err) {
					fallbackProjectResolve.call(this, deferred, parents);
				}.bind(this));
			}
		}
		return deferred;
	}
	
	/**
	 * @description Fallabck function to try and find the project context if the file client call fails
	 * @param {Deferred} deferred The deferred to resolve
	 * @param {Array.<?>} parents The array of parents to look in  
	 * @since 14.0
	 */
	function fallbackProjectResolve(deferred, parents) {
		if(Util.isElectron) {
			//TODO call out the server for #getProject
			var promises = [],
				prnt = parents[parents.length-1];
			this.projectFiles.forEach(function(_f) {
				promises.push(this.getFile(_f, prnt.Location));
				promises.push(this.getFile(_f, "/file/"));
			}.bind(this));
			promises.reduce(function(prev, item, index, array) {
                return prev.then(function(_file) {
                    if(_file && _file.contents) {
                        deferred.resolve({Location: _file.project});
                        return item.reject("done");
                    }
                    if(index === array.length-1) {
                        //nothing was found, assume /file/
                        deferred.resolve({Location: "/file/"});
                    }
                    return item;
                });
			}, new Deferred().resolve());
		} else {
			deferred.resolve(parents[parents.length-1]);
		}
	}

	/**
	 * Callback from the fileClient event listener
	 * @param {Object} evnt A file client Changed event.
	 */
	JavaScriptProject.prototype.onFileChanged = function onFileChanged(evnt) {
		if(evnt && evnt.type === 'Changed') {
			_updateMap.call(this, evnt.modified, "onModified");
			_updateMap.call(this, evnt.deleted, "onDeleted");
			_updateMap.call(this, evnt.created, "onCreated");
			_updateMap.call(this, evnt.moved, "onMoved");
		}
	};
	/**
	 * Update the backing map
	 * @param {Array.<String>} arr The array to walk
	 * @param {String} state The state, one of: onModified, onDeleted, onCreated
	 */
	function _updateMap(arr, state) {
		if(Array.isArray(arr)) {
			arr.forEach(function(file) {
				var f, toQ, toN, n;
				switch(state) {
					case 'onCreated': {
						n = file.result ? file.result.Name : undefined;
						f = file.result ? file.result.Location : undefined;
						if(n === this.NODE_MODULES && Boolean(file.result.Directory)) {
							this._node_modules = true;
						}
						break;
					}
					case 'onDeleted': {
						f = file.deleteLocation;
						n = _shortName(file.deleteLocation);
						if(f.lastIndexOf(this.NODE_MODULES)+this.NODE_MODULES.length-1 === f.length-2) {
							delete this._node_modules;
						}
						break;
					}
					case 'onModified': {
						n = _shortName(file);
						f = file;
						break;
					}
					case 'onMoved': {
						toQ = file.result ? file.result.Location : undefined;
						toN = file.result ? file.result.Name : undefined;
						n = _shortName(file.source);
						f = file.source;
						if(f.lastIndexOf(this.NODE_MODULES) + this.NODE_MODULES.length-1 === f.length-2) {
							delete this._node_modules;
						}
						if(file.result && file.result.Name === this.NODE_MODULES && Boolean(file.result.Directory)) {
							this._node_modules = true;
						}
						break;
					}
				}
				delete this.map[f];
				_handle.call(this, state, this, f, n, toQ, toN);
			}.bind(this));
		}
	}
	/**
	 * @description Returns the shortname of the file
	 * @param {String} fileName The fully qualified path of the file
	 * @returns {String} The last segment of the path (short name)
	 */
	function _shortName(fileName) {
		var i = fileName.lastIndexOf('/');
		if(i > -1) {
			return fileName.substr(i+1);
		}
		return fileName;
	}

	/**
	 * @description Delegates to a handler for the given handler name (file type), with the given function name
	 * @param {String} funcName The name of the function to call on the handler iff it exists
	 */
	function _handle(funcName) {
		if(Array.isArray(this.handlers)) {
			var args = Array.prototype.slice.call(arguments);
			this.handlers.forEach(function(handler) {
				var f = handler[funcName];
				if(typeof f === 'function') {
					f.apply(handler, args.slice(1));
				}
			});
		}
	}

	return JavaScriptProject;
});