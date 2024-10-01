/*global window, process, global,module*/

"format global";

;(function(run) {
  var isNodejs = typeof module !== "undefined" && module.exports;
  var exports = isNodejs ? module.exports : window.paredit;
  var util = isNodejs ? require('./util').util : window.paredit.util;
  var nav = isNodejs ? require("./navigator").navigator : window.paredit.navigator;
  var w = isNodejs ? require("./navigator").walk : window.paredit.walk;
  run(nav, w, util, exports);

})(function(nav, w, util, exports) {

  exports.specialForms = [
        "case", "if-object",

        "define", "define-mutable", "define-volatile",
        "define-class", "define-param-class", "define-goops-class", "define-prim-class",
        "define-proper-program", "define-script",
        "define-interface", "define-body",
        "define-syntax",

        "declare", "declare-method", 
        "declare-virtual-method", "declare-static-virtual-method",
        "declare-simple-method", "declare-static-simple-method",
        "declare-simple-virtual-method",
        "declare-static-simple-virtual-method",

        "add-method", "add-virtual-method", "add-static-virtual-method",

        "lambda", "lambda-automatic", "param-lambda", "param-lambda-automatic",

        "guard", "guard-nonpure", "guard-without-result",
        "guard-general", "guard-general-nonpure",
        "guard-general-without-result",
        "guard0", "guard0-nonpure", "guard0-without-result",
        "let", "let-mutable", "let-volatile",
        "let*", "let*-mutable", "let*-volatile",
        "letrec", "letrec-mutable", "letrec-volatile",
        "letrec*", "letrec*-mutable", "letrec*-volatile",
        "set!",
        "until", "match-type", "match-type-strong",
        "syntax-rules",

        "call/cc", "call-with-current-continuation",
        "call/cc-nonpure", "call-with-current-continuation-nonpure",
        "call/cc-without-result",
        "call-with-current-continuation-without-result",

        "exec/cc", "execute-with-current-continuation",
        "exec/cc-nonpure", "execute-with-current-continuation-nonpure",
        "exec/cc-without-result",
        "execute-with-current-continuation-without-result",

        "make", "fluid-let",

        "$lambda", "$define", "$let", "$let*", "$letrec", "$letrec*"

  ];

  exports.specialForms1 = [
        "define-main-proc", "with-syntax",
        "iterate-list", "iterate-list-pure",
        "iterate-list-with-break", "iterate-list-with-break-pure",
        "iterate-2-lists", "iterate-2-lists-pure",
        "iterate-2-lists-with-break", "iterate-2-lists-with-break-pure"
  ];

  exports.specialForms2 = [
        "define-simple-proc", "define-simple-method",
        "define-param-logical-type", "define-signature",
        "declare-param-method", "declare-static-param-method",
        "declare-param-virtual-method", "declare-static-param-virtual-method",
        "define-param-proc-alt", "do",
        "syntax-case",
        "receive"
  ];

  exports.specialForms3 = [
        "define-param-proc", "define-param-method", "define-param-signature"
  ];

  var ed = exports.editor = {

    rewrite: function(ast, nodeToReplace, newNodes) {
      var indexOffset = newNodes.length ?
        last(newNodes).end - nodeToReplace.end :
        nodeToReplace.start - nodeToReplace.end;

      var parents = w.containingSexpsAt(ast, nodeToReplace.start);

      // Starting from the parent of the nodeToReplace: construct new
      // parents out of the changed child, bottom up
      // With that we don't need to modify the exising AST. Note that during
      // this recursive construction we need to update the children to the "right"
      // of the modification
      var replaced = parents.reduceRight(function(replacement, parent) {
        var idxInParent = parent.children.indexOf(replacement.original);
        var childList;

        if (idxInParent > -1) {
          childList = parent.children.slice(0,idxInParent)
            .concat(replacement.nodes)
            .concat(parent.children.slice(idxInParent+1)
              .map(moveNode.bind(null,indexOffset)));
        } else childList = parent.children;

        var newParent = util.merge(parent, {
          end: parent.end+indexOffset,
          children: childList
        });

        return {original: parent, nodes: [newParent]};
      }, {original: nodeToReplace, nodes: newNodes});

      return replaced.nodes[0];
    },

    openList: function(ast, src, idx, args) {
      args = args || {};
      var count = args.count || 1;
      var open = args.open || '(', close = args.close || ')';

      if (args.freeEdits || ast.errors && ast.errors.length) return {
        changes: [["insert", idx, open]],
        newIndex: idx+open.length
      }

      var containing = w.containingSexpsAt(ast, idx);
      var l = last(containing);
      if (l && l.type === "comment" || l.type === "string")
          return {changes: [["insert", idx, open]], newIndex: idx+open.length}

      if (!args.endIdx) { // not a selection range
        return {changes: [["insert", idx, open+close]], newIndex: idx+open.length}
      }


      var parentStart = last(w.containingSexpsAt(ast, idx, w.hasChildren));
      var parentEnd = last(w.containingSexpsAt(ast, args.endIdx, w.hasChildren));

      // does selection span multiple expressions? collapse selection
      // var left = parentEnd.children.filter(function(ea) { return ea.end <= pos; });
      // var right = parentEnd.children.filter(function(ea) { return pos <= ea.start; });

      if (parentStart !== parentEnd) {
        return {changes: [["insert", idx, open+close]], newIndex: idx+open.length}
      }

      var inStart = parentEnd.children.filter(function(ea) {
            return ea.start < idx && idx < ea.end ; }),
          inEnd = parentEnd.children.filter(function(ea) {
            return ea.start < args.endIdx && args.endIdx < ea.end ; }),
          moveStart = inStart[0] && inStart[0] !== inEnd[0]
                   && (inEnd[0] || inStart[0].type !== 'symbol'),
          moveEnd = inEnd[0] && inStart[0] !== inEnd[0]
                 && (inStart[0] || inEnd[0].type !== 'symbol'),
          insertOpenAt = moveStart ? inStart[0].end : idx,
          insertCloseAt = moveEnd ? inEnd[0].start : args.endIdx;

      return {
        changes: [["insert", insertCloseAt, close],
                  ["insert", insertOpenAt, open]],
        newIndex: insertOpenAt+open.length
      };

    },

    spliceSexp: function(ast, src, idx) {
      var sexps = w.containingSexpsAt(ast,idx,w.hasChildren);
      if (!sexps.length) return null;
      var parent = sexps.pop();
      var onTop = parent.type === "toplevel";

      var insideSexp = parent.children.filter(function(n) {
        return n.start < idx && idx < n.end; })[0];
      var insideString = insideSexp && insideSexp.type === 'string';


      var changes = [], newIndex = idx;

      if (!onTop) changes.push(['remove', parent.end-1, parent.close.length]);
      if (insideString) {
        changes.push(['remove', insideSexp.end-1, insideSexp.close.length]);
        changes.push(['remove', insideSexp.start, insideSexp.open.length]);
        newIndex -= insideSexp.open.length;
      }
      if (!onTop) {
        changes.push(['remove', parent.start, parent.open.length]);
        newIndex -= parent.open.length;
      }

      return {changes: changes, newIndex: newIndex};
    },

    spliceSexpKill: function(ast, src, idx, args) {
      args = args || {}
      var count = args.count || 1;
      var backward = args.backward;

      var sexps = w.containingSexpsAt(ast,idx,w.hasChildren);
      if (!sexps.length) return null;

      if (backward) {
        var left = leftSiblings(last(sexps), idx);
        var killed = ed.killSexp(ast, src, idx/*last(left).end*/,
          {count: left.length, backward: true})
      } else {
        var right = rightSiblings(last(sexps), idx);
        var killed = ed.killSexp(ast, src, idx/*last(right).end*/,
          {count: right.length, backward: false})
      }

      var spliced = ed.spliceSexp(ast,src,idx);

      if (!killed) return spliced;
      if (!spliced) return killed;

      var changes = Array.prototype.slice.call(spliced.changes);
      if (changes.length === 2) changes.splice(1,0,killed.changes[0])
      else if (changes.length === 4) changes.splice(2,0,killed.changes[0])

      return {
        changes: changes,
        newIndex: killed.newIndex-(changes.length === 3 ? 1 : 2)
      }

    },

    splitSexp: function(ast, src, idx) {
      var sexps = w.containingSexpsAt(ast,idx);
      if (!sexps.length) return null;
      var sexp = sexps.pop();
      if (sexp.type === "toplevel") return null;
      if (!w.hasChildren(sexp) && sexp.type !== "string")
        return null;
      // we are dealing with a list or string split
      var insertion = sexp.close+" "+sexp.open,
          newIndex = idx+sexp.close.length,
          changes = [['insert', idx, insertion]];
      return {changes: changes, newIndex: newIndex};
    },

    killSexp: function(ast, src, idx, args) {
      args = args || {}
      var count = args.count || 1;
      var backward = args.backward;
      var sexps = w.containingSexpsAt(ast,idx, w.hasChildren);
      if (!sexps.length) return null;
      var parent = sexps.pop();

      var insideSexp = parent.children.filter(function(n) {
        return n.start < idx && idx < n.end; })[0];

      if (insideSexp) {
        var from = backward ? insideSexp.start : idx;
        var to = backward ? idx : insideSexp.end;
        if (insideSexp.type === 'string') {
          from += backward ? insideSexp.open.length : 0;
          to += backward ? 0 : -insideSexp.close.length;
        }
        return {
          changes: [['remove', from, to-from]],
          newIndex: from
        }
      }

      if (insideSexp && insideSexp.type === 'string') {
        var from = backward ? insideSexp.start+insideSexp.open.length : idx;
        var to = backward ? idx : insideSexp.end-insideSexp.close.length;
        return {
          changes: [['remove', from, to-from]],
          newIndex: from
        }
      }

      if (backward) {
        var left = leftSiblings(parent, idx);
        if (!left.length) return null;
        var remStart = left.slice(-count)[0].start;
        var changes = [['remove', remStart, idx-remStart]];
        var newIndex = remStart;
      } else {
        var right = rightSiblings(parent, idx);
        if (!right.length) return null;
        var newIndex = idx;
        var changes = [['remove', idx, last(right.slice(0,count)).end-idx]];
      }

      return {changes: changes, newIndex: newIndex};
    },

    wrapAround: function(ast, src, idx, wrapWithStart, wrapWithEnd, args) {
      var count = (args && args.count) || 1;
      var sexps = w.containingSexpsAt(ast,idx, w.hasChildren);
      if (!sexps.length) return null;
      var parent = last(sexps);
      var sexpsToWrap = parent.children.filter(function(c) {
        return c.start >= idx; }).slice(0,count);
      var end = last(sexpsToWrap);
      var changes = [
        ['insert', idx, wrapWithStart],
        ['insert', (end ? end.end : idx) + wrapWithStart.length, wrapWithEnd]];
      return {changes: changes, newIndex: idx+wrapWithStart.length};
    },

    closeAndNewline: function(ast, src, idx, close) {
      close = close || ")"
      var sexps = w.containingSexpsAt(ast,idx, function(n) {
        return w.hasChildren(n) && n.close === close; });
      if (!sexps.length) return null;
      var parent = last(sexps),
          newlineIndent = times(rowColumnOfIndex(src, parent.start), ' '),
          insertion = "\n"+newlineIndent;
      var changes = [
        ['insert', parent.end, insertion]];
      return {changes: changes, newIndex: parent.end+insertion.length};
    },

    barfSexp: function(ast, src, idx, args) {
      var backward = args && args.backward;
      var sexps = w.containingSexpsAt(ast,idx, w.hasChildren);
      if (!sexps.length) return null;
      var parent = last(sexps), inner = last(w.containingSexpsAt(ast,idx));
      if (inner === parent) inner = null;
      if (backward) {
        var left = leftSiblings(parent, idx);
        if (!left.length) return null;
        var changes = [
          ['insert', left[1] ? left[1].start : (inner ? inner.start : idx), parent.open],
          ['remove', parent.start, parent.open.length]];
      } else {
        var right = rightSiblings(parent, idx);
        if (!right.length) return null;
        var changes = [
          ['remove', parent.end-parent.close.length, parent.close.length],
          ['insert', right[right.length-2] ? right[right.length-2].end : (inner ? inner.end : idx), parent.close]];
      }
      return {changes: changes, newIndex: idx};
    },

    slurpSexp: function(ast, src, idx, args) {
      var backward = args && args.backward;
      var count = args.count || 1;
      var sexps = w.containingSexpsAt(ast,idx, w.hasChildren);
      if (sexps.length < 2) return null;
      var parent = sexps.pop();
      var parentParent = sexps.pop();
      if (backward) {
        var left = leftSiblings(parentParent, idx);
        if (!left.length) return null;
        var changes = [
          ['remove', parent.start, parent.open.length],
          ['insert', left.slice(-count)[0].start, parent.open]];
      } else {
        var right = rightSiblings(parentParent, idx);
        if (!right.length) return null;
        var changes = [
          ['insert', last(right.slice(0,count)).end, parent.close],
          ['remove', parent.end-parent.close.length, parent.close.length]];
      }
      return {changes: changes, newIndex: idx};
    },

    transpose: function(ast,src,idx,args) {
      args = args || {};

      var outerSexps = w.containingSexpsAt(ast, idx, w.hasChildren),
          parent = last(outerSexps),
          left = leftSiblings(parent, idx),
          right = rightSiblings(parent, idx),
          inside = parent.children.find(function(n) {
            return n.start < idx && idx < n.end; });

      // if "inside" a leaf node, use it to transpose with node left of in
      if (inside) right = [inside];
      // nothing there to transpose...
      if (!left.length || !right.length) return null;

      var l = last(left), r = right[0],
          insertion = src.slice(l.end, r.start) + w.source(src, l);

      return {
        changes: [
          ['insert', r.end, insertion],
          ['remove', l.start, r.start-l.start]],
        newIndex: idx - (l.end-l.start)+(r.end-r.start)
      };

    },

    delete: function(ast,src,idx,args) {
      args = args || {};

      var count = args.count || 1,
          backward = !!args.backward,
          endIdx = args.endIdx; // for text ranges

      if (args.freeEdits || ast.errors && ast.errors.length) {
        return endIdx ? {
          changes: [["remove", idx, endIdx-idx]],
          newIndex: idx
        } : {
          changes: [["remove", backward ? idx-count : idx, count]],
          newIndex: backward ? idx-count : idx
        }
      }


      var outerSexps = w.containingSexpsAt(ast, idx),
          outerLists = outerSexps.filter(function(n) { return w.hasChildren(n); }),
          parent = last(outerLists), sexp = last(outerSexps);

      var deleteRange = typeof endIdx === "number";
      if (deleteRange) {
        var endParent = last(w.containingSexpsAt(ast, endIdx, w.hasChildren));
        if (parent !== endParent) return null;
        var insideNodeStart = last(w.sexpsAt(parent, idx));
        var insideNodeEnd = last(w.sexpsAt(parent, endIdx));

        // don't delete only one " of strings
        var atStartOfUnsaveDelete = !isSaveToPartialDelete(insideNodeStart) && insideNodeStart.start === idx;
        var atEndOfUnsaveDelete = !isSaveToPartialDelete(insideNodeEnd) && insideNodeEnd.end === endIdx;
        if (insideNodeStart === insideNodeEnd
         && ((atStartOfUnsaveDelete && !atEndOfUnsaveDelete)
          || (!atStartOfUnsaveDelete && atEndOfUnsaveDelete))) return null;
        // if (!isSaveToPartialDelete(insideNodeStart) && insideNodeStart.start === idx) return null;
        // if (!isSaveToPartialDelete(insideNodeEnd) && insideNodeEnd.end === endIdx) return null;
        if (((insideNodeEnd !== parent && !isSaveToPartialDelete(insideNodeEnd) && !atEndOfUnsaveDelete)
         || (insideNodeStart !== parent && !isSaveToPartialDelete(insideNodeStart) && !atStartOfUnsaveDelete))
         && insideNodeStart !== insideNodeEnd) return null;
        if ((parent.children.indexOf(insideNodeStart) === -1 && insideNodeStart !== parent)
         || (parent.children.indexOf(insideNodeEnd) === -1 && insideNodeEnd !== parent)) return null;
        var delStart = Math.min(idx, endIdx),
            delEnd = Math.max(idx, endIdx);
        return {changes: [['remove', delStart, delEnd-delStart]], newIndex: delStart}
      }

      var isInList = parent === sexp,
          left = isInList && leftSiblings(parent, idx),
          right = isInList && rightSiblings(parent, idx),
          noDelete = {changes: [], newIndex: idx},
          moveLeft = {changes: [], newIndex: idx-1},
          simpleDelete = {
            changes: [['remove', backward ? idx-count : idx, count]],
            newIndex: backward ? idx-count : idx
          },
          changes = [], newIndex = idx;

      if (!isInList && sexp.type === 'comment') return simpleDelete;

      if (left && left.length && backward) {
        var n = last(left);
        if (n.end !== idx || isSaveToPartialDelete(n)) return simpleDelete;
        if (isEmpty(n) || n.type === "char") return deleteSexp(n);
        if (count == 1) return moveLeft;
        return noDelete;
      }

      if (right && right.length && !backward) {
        var n = right[0];
        if (n.start !== idx || isSaveToPartialDelete(n)) return simpleDelete;
        if (isEmpty(n) || n.type === "char") return deleteSexp(n);
        return noDelete;
      }

      if (!isInList) parent = sexp;

      var atStart = idx === parent.start+(parent.open ? parent.open.length : 0);
      var atEnd = idx === parent.end-(parent.close ? parent.close.length : 0);
      if ((!parent.children || !parent.children.length)
       && ((atStart && backward) || (atEnd && !backward))) {
        return deleteSexp(parent);
      }

      if (atStart && backward && (isInList ? parent.children.length : parent.end-parent.start > 1))
        return noDelete;
      if (atEnd && !backward && (isInList ? parent.children.length : parent.end-parent.start > 1))
        return noDelete;

      return simpleDelete;

      // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
      function isEmpty(sexp) {
        return (sexp.type === 'string' || sexp.type === "list")
            && sexp.end-sexp.start === sexp.open.length+sexp.close.length
      }
      function deleteSexp(sexp) {
        return {
          changes: [['remove', sexp.start, sexp.end-sexp.start]],
          newIndex: sexp.start}
      }
      function isSaveToPartialDelete(n) {
        return n.type === 'symbol'|| n.type === 'comment' || n.type === 'number'
            || n.type === 'special';
      }
    },

    indentRange: function(ast, src, start, end) {
      var hashSpecial = computeSpecials( );
      var startLineIdx = rowStartIndex(src, start),
          endLineIdx = src.slice(end).indexOf("\n");
      endLineIdx = endLineIdx > -1 ? endLineIdx+end : src.length;

      var linesToIndent = src.slice(startLineIdx, endLineIdx).split("\n");

      return linesToIndent.reduce(function(indent, line) {
        var idx = indent.idx,
            changes = indent.changes,
            ast = indent.ast,
            src = indent.src;

        var outerSexps = w.containingSexpsAt(ast, idx, w.hasChildren),
            parent = last(outerSexps),
            sexpAtBol = parent && last(w.sexpsAt(ast, idx));

        if (!parent) return {
          idx: idx+line.length+1,
          newIndex: idx,
          changes:changes, ast:ast, src: src
        };

        // whitespace at bol that needs to be "removed"
        var ws = line.match(/^\s*/)[0],
        // figure out much whitespace we need to add
        indentOffset = sexpAtBol
                        && sexpAtBol.type === 'string'
                        && idx > sexpAtBol.start ?
                          0 : computeIndentOffset(hashSpecial, src, parent, idx) - ws.length,
            lineLength = line.length + indentOffset;
        
        // record what needs to be changed and update source
        if (indentOffset > 0) {
          var insert = times(indentOffset, " ");
          // var insert = sexpAtBol.input;
          changes.push(["insert", idx, insert]);
          src = src.slice(0,idx) + insert + src.slice(idx);
        } else if (indentOffset < 0) {
          changes.push(["remove", idx, -indentOffset]);
          src = src.slice(0,idx) + src.slice(idx-indentOffset);
        }

        // also update the ast: "move" the next node to the right accordingly,
        // "update" the entire ast
        var right = rightSiblings(parent, idx)[0];
        if (right) {
          var indentedRight = moveNode(indentOffset, right);
          ast = ed.rewrite(ast, right, [indentedRight]);
        } else {
          // if no siblings, udpdate the end of the list node
          ast = ed.rewrite(ast, parent,
            [util.merge(parent, {end: parent.end+indentOffset})]);
        }

        return {
          idx: idx + lineLength + 1, /*newline*/
          newIndex: idx + indentOffset, // for cursor placement
          changes: changes, ast: ast, src: src
        }
      }, {idx: startLineIdx, changes: [], ast: ast, src: src});
    }

  };


  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // positioning helpers

  function rowStartIndex(src, idx) { return src.slice(0,idx).lastIndexOf("\n")+1; }

  function rowColumnOfIndex(src, idx) { return idx - rowStartIndex(src,idx); }

  function computeChildIndex(children, idx) {
        var iLen = children.length;
        var iCur = 0;
        while( iCur < iLen && idx > children[iCur].end ) {
                iCur++;
        }
        return iCur < iLen ? iCur : -1;
  }

  function computeIndentOffset(hashSpecial, src, parentSexp, idx) {
    if (parentSexp.type === 'toplevel') return 0;
    var left = leftSiblings(parentSexp, idx);
    var iSpecial = getSpecialFormIndex(hashSpecial, parentSexp);
    if( Number.isInteger(iSpecial) ) {
        var iChild = computeChildIndex(parentSexp.children, idx);
        if (iChild >= 1 && iChild <= iSpecial) {
                return rowColumnOfIndex(src, parentSexp.start + parentSexp.open.length+3);
        } else {
                return rowColumnOfIndex(src, parentSexp.start + parentSexp.open.length+1);
        }
    }
    if (left.length <= 1 || parentSexp.open !== "(")
      return rowColumnOfIndex(src, parentSexp.start + parentSexp.open.length);
    return rowColumnOfIndex(src, left[1].start);
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // lang helper

  function last(a) { return a[a.length-1]; };

  function times(n, ch) { return new Array(n+1).join(ch); }


  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // ast helpers
  function moveNode(offset, n) {
    // changes start/end of node and its children
    return util.mapTree(n,
      function(n, children) {
        return util.merge(n, {
          start: n.start+offset,
          end: n.end+offset,
          children: children
        });
      }, function(n) { return n.children; });
  }

  function leftSiblings(parentNode, idx) {
    return parentNode.children.filter(function(n) {
      return n.end <= idx; });
  }

  function rightSiblings(parentNode, idx) {
    return parentNode.children.filter(function(n) {
      return idx <= n.start; });
  }

  function isSpecialForm(parentSexp, src) {
    if (!w.hasChildren(parentSexp) || !parentSexp.children.length) return false;
    var srcOfFirstNode = parentSexp.children[0].source;
    if (!srcOfFirstNode) return false;
    return exports.specialForms.some(function(f) {
      if (typeof f === "string") return f === srcOfFirstNode;
      else if (typeof f === "function") return f(srcOfFirstNode, parentSexp.children[0]);
      else if (f instanceof RegExp) return f.test(srcOfFirstNode);
      else return false;
    });
  }

  function isSomeSpecialForm(someSpecialForms, parentSexp, src) {
        if (!w.hasChildren(parentSexp) || !parentSexp.children.length) return false;
        var srcOfFirstNode = parentSexp.children[0].source;
        if (!srcOfFirstNode) return false;
        return someSpecialForms.some(function(f) {
          if (typeof f === "string") return f === srcOfFirstNode;
          else if (typeof f === "function") return f(srcOfFirstNode, parentSexp.children[0]);
          else if (f instanceof RegExp) return f.test(srcOfFirstNode);
          else return false;
        });
  }

  function computeSpecials() {
        var result = new Map();
        exports.specialForms.map((element) => {
          result.set(element, 0);
        });
        exports.specialForms1.map((element) => {
          result.set(element, 1);
        });
        exports.specialForms2.map((element) => {
          result.set(element, 2);
        });
        exports.specialForms3.map((element) => {
          result.set(element, 3);
        });
        return result;
    }

  function getSpecialFormIndex(hashSpecial, parentSexp) {
        if (!w.hasChildren(parentSexp) || !parentSexp.children.length)
                return undefined;
        var srcOfFirstNode = parentSexp.children[0].source;
        // if (!srcOfFirstNode) return -1;
        return hashSpecial.get(srcOfFirstNode);
  }

});
