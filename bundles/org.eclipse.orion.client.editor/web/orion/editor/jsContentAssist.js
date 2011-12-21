/*******************************************************************************
 * @license
 * Copyright (c) 2011 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
/*global define */

define("orion/editor/jsContentAssist", [], function() {

	//from ECMA 262 - section 15.5.4
	var stringMethods = [
		{name: "charAt", args: ["index"]},
		{name: "charCodeAt", args: ["index"]},
		{name: "concat", args: ["array"]},
		{name: "indexOf", args: ["searchString", "[position]"]},
		{name: "lastIndexOf", args: ["searchString", "[position]"]},
		{name: "localeCompare", args: ["object"]},
		{name: "match", args: ["regexp"]},
		{name: "replace", args: ["searchValue", "replaceValue"]},
		{name: "search", args: ["regexp"]},
		{name: "slice", args: ["start", "end"]},
		{name: "split", args: ["separator", "[limit]"]},
		{name: "substring", args: ["start", "[end]"]},
		{name: "toLowerCase", args: []},
		{name: "toLocaleLowerCase", args: []},
		{name: "toUpperCase", args: []},
		{name: "toLocaleUpperCase", args: []},
		{name: "trim", args: []}
	];
	var stringProperties = ["length"];

	/**
	 * Returns a string of all the whitespace at the start of the current line.
	 * @param {String} buffer The document
	 * @param {Object} selection The current selection
	 * @param {Integer} selection.offset The current selection offset
	 */
	function leadingWhitespace(buffer, selection) {
		var whitespace = "";
		var offset = selection.offset-1;
		while (offset > 0) {
			var c = buffer.charAt(offset--);
			if (c === '\n' || c === '\r') {
				//we hit the start of the line so we are done
				break;
			}
			if (/\s/.test(c)) {
				//we found whitespace to add it to our result
				whitespace = c.concat(whitespace);
			} else {
				//we found non-whitespace, so reset our result
				whitespace = "";
			}

		}
		return whitespace;
	}
	
	/**
	 * Returns the current line up to, but not including, the prefix
	 */
	function prefixLine(prefix, buffer, selection) {
		var offset = selection.offset-1;
		while (offset > 0) {
			var c = buffer.charAt(offset);
			if (c === '\n' || c === '\r') {
				//we hit the start of the line so we are done
				break;
			}
			offset--;
		}
		return buffer.substring(offset+1, (selection.offset-prefix.length));
	}
	
	/**
	 * Attempts to infer the type of the receiver of a function.
	 */
	function inferType(prefix, buffer, selection) {
		var line = prefixLine(prefix, buffer, selection);
		//Note: we already know at this point the line ends with a dot
		//if the last character is a quote and there is an odd number of quotes on the line, then we have a string literal
		if (line.length > 1 && (line.charAt(line.length-2) === "\"" || line.charAt(line.length-2) === "'")) {
			return "String";
		}
		//we failed to infer the type
		return null;
	}

	/**
	 * Returns proposals for completion on members of an object
	 */
	function getMemberProposals(prefix, buffer, selection) {
		//TODO type inferencing
		var proposals = [];

		//common vars for each proposal
		var text, description, positions, endOffset;
		
		var type = inferType(prefix, buffer, selection);
		if (type === "String") {
			for (var i = 0; i < stringMethods.length; i++) {
				var name = stringMethods[i].name;
				//don't bother computing proposals that don't match
				if (name.indexOf(prefix) !== 0) {
					continue;
				}
				var args = stringMethods[i].args;
				if (args.length === 0) {
					//don't use linked mode for functions with no arguments
					text = name + "()";
					description = text + " - String";
					proposals.push({proposal: text, description: description});
					continue;
				}
				text = name + "(";
				//add linked mode position for each function argument
				positions = [];
				endOffset = selection.offset + name.length+1 - prefix.length;
				for (var argIndex = 0; argIndex < args.length; argIndex++) {
					positions.push({offset: endOffset, length: args[argIndex].length});
					endOffset += args[argIndex].length+2;//add extra for comma and space
					//add argument to completion string
					text += args[argIndex];
					if (argIndex < args.length - 1) {
						text += ", ";
					}
				}
				text += ")";
				description = text + " - String";
				endOffset--;//no comma after last argument
				proposals.push({proposal: text, description: description, positions: positions, escapePosition: endOffset});
			}
		}
		
		//functions common to all objects - ECMA 262, section 15.2.4.
		var members = ["toString", "toLocaleString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable"];
		for (var memberIndex = 0; memberIndex < members.length; memberIndex++) {
			if (members[memberIndex].indexOf(prefix) === 0) {
				proposals.push(members[memberIndex]);
			}
		}

		return proposals;
	}

	/**
	 * Returns proposals for javascript templates
	 */
	function getTemplateProposals(prefix, buffer, selection) {
		//any returned positions need to be offset based on current cursor position and length of prefix
		var startOffset = selection.offset-prefix.length;
		var proposals = [];
		var whitespace = leadingWhitespace(buffer, selection);
		//common vars for each proposal
		var text, description, positions, endOffset;
		if ("if".indexOf(prefix) === 0) {
			//if statement
			text = "if (condition) {\n" + whitespace + "\t\n" + whitespace + '}';
			description = "if - if statement";
			positions = [{offset: startOffset+4, length: 9}];
			endOffset = startOffset+whitespace.length+18;//after indentation inside if body
			proposals.push({proposal: text, description: description, positions: positions, escapePosition: endOffset});
			//if/else statement
			text = "if (condition) {\n" + whitespace + "\t\n" + whitespace + "} else {\n" + whitespace + "\t\n" + whitespace + "}";
			description = "if - if else statement";
			positions = [{offset: startOffset+4, length: 9}];
			endOffset = startOffset+whitespace.length+18;//after indentation inside if body
			proposals.push({proposal: text, description: description, positions: positions, escapePosition: endOffset});
		}
		if ("for".indexOf(prefix) === 0) {
			//for loop
			text = "for (var i = 0; i < array.length; i++) {\n" + whitespace + "\t\n" + whitespace + '}';
			description = "for - iterate over array";
			positions = [{offset: startOffset+9, length: 1}, {offset: startOffset+20, length: 5}];
			endOffset = startOffset+whitespace.length+42;//after indentation inside for loop body
			proposals.push({proposal: text, description: description, positions: positions, escapePosition: endOffset});
			//for ... in statement
			text = "for (var property in object) {\n" + whitespace + "\tif (object.hasOwnProperty(property)) {\n" + 
				whitespace + "\t\t\n" + whitespace + "\t}\n" + whitespace + '}';
			description = "for..in - iterate over properties of an object";
			positions = [{offset: startOffset+9, length: 8}, {offset: startOffset+21, length: 6}];
			endOffset = startOffset+(2*whitespace.length)+73;//after indentation inside if statement body
			proposals.push({proposal: text, description: description, positions: positions, escapePosition: endOffset});
		}
		//while loop
		if ("while".indexOf(prefix) === 0) {
			text = "while (condition) {\n" + whitespace + "\t\n" + whitespace + '}';
			description = "while - while loop with condition";
			positions = [{offset: startOffset+7, length: 9}];
			endOffset = startOffset+whitespace.length+21;//after indentation inside while loop body
			proposals.push({proposal: text, description: description, positions: positions, escapePosition: endOffset});
		}
		//do/while loop
		if ("do".indexOf(prefix) === 0) {
			text = "do {\n" + whitespace + "\t\n" + whitespace + "} while (condition);";
			description = "do - do while loop with condition";
			positions = [{offset: startOffset+16, length: 9}];
			endOffset = startOffset+whitespace.length+6;//after indentation inside do/while loop body
			proposals.push({proposal: text, description: description, positions: positions, escapePosition: endOffset});
		}
		//switch statement
		if ("switch".indexOf(prefix) === 0) {
			text = "switch (expression) {\n" + whitespace + "\tcase value1:\n" + whitespace + "\t\t\n" +
			whitespace + "\t\tbreak;\n" + whitespace + "\tdefault:\n" + whitespace + "}";
			description = "switch - switch case statement";
			positions = [{offset: startOffset+8, length: 10}, {offset: startOffset + 28, length: 6}];
			endOffset = startOffset+(2*whitespace.length)+38;//after indentation inside first case statement
			proposals.push({proposal: text, description: description, positions: positions, escapePosition: endOffset});
		}
		if ("try".indexOf(prefix) === 0) {
			//try..catch statement
			text = "try {\n" + whitespace + "\t\n" + whitespace + "} catch (err) {\n" + whitespace + "}";
			description = "try - try..catch statement";
			endOffset = startOffset+whitespace.length+7;//after indentation inside try statement
			proposals.push({proposal: text, description: description, escapePosition: endOffset});
			//try..catch..finally statement
			text = "try {\n" + whitespace + "\t\n" + whitespace + "} catch (err) {\n" + whitespace +
				"} finally {\n" + whitespace + "}";
			description = "try - try..catch statement with finally block";
			endOffset = startOffset+whitespace.length+7;//after indentation inside try statement
			proposals.push({proposal: text, description: description, escapePosition: endOffset});
		}
		return proposals;
	}

	/**
	 * Returns proposals for javascript keywords.
	 */
	function getKeyWordProposals(prefix, buffer, selection) {
		var keywords = ["break", "case", "catch", "continue", "debugger", "default", "delete", "do", "else", "finally", 
			"for", "function", "if", "in", "instanceof", "new", "return", "switch", "this", "throw", "try", "typeof", 
			"var", "void", "while", "with"];
		if (prefix.length === 0) {
			return keywords;
		}
		var proposals = [];
		for (var i = 0; i < keywords.length; i++) {
			if (keywords[i].indexOf(prefix) === 0) {
				proposals.push(keywords[i]);
			}
		}
		return proposals;
	}

	/**
	 * @name orion.editor.JavaScriptContentAssistProvider
	 * @class Provides content assist for JavaScript keywords.
	 */

	function JavaScriptContentAssistProvider() {}

	JavaScriptContentAssistProvider.prototype = /** @lends orion.editor.JavaScriptContentAssistProvider.prototype */
	{
		getKeywords: function(prefix, buffer, selection) {
			var proposals = [];

			if (selection.offset > 0) {
				//if the character preceeding the prefix is a '.' character, then we are completing an object member
				var preceedingChar = buffer.charAt(selection.offset - prefix.length - 1);
				if (preceedingChar === '.') {
					return getMemberProposals(prefix, buffer, selection, proposals);
				}
			}
			//we are not completing on an object member, so suggest templates and keywords
			proposals = proposals.concat(getTemplateProposals(prefix, buffer, selection, proposals));
			proposals = proposals.concat(getKeyWordProposals(prefix, buffer, selection, proposals));
			return proposals;
		}
	};

	return {
		JavaScriptContentAssistProvider: JavaScriptContentAssistProvider
	};
});