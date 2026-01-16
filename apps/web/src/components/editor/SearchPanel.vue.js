import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { Search, Replace, ChevronUp, ChevronDown, X, CaseSensitive, Regex, WholeWord } from 'lucide-vue-next';
const props = defineProps();
const emit = defineEmits();
// Search state
const searchQuery = ref('');
const replaceQuery = ref('');
const caseSensitive = ref(false);
const wholeWord = ref(false);
const useRegex = ref(false);
const showReplace = ref(false);
// Results
const matches = ref([]);
const currentMatchIndex = ref(-1);
// Refs for focus management
const searchInputRef = ref();
// Computed
const currentMatch = computed(() => {
    if (currentMatchIndex.value >= 0 && currentMatchIndex.value < matches.value.length) {
        return matches.value[currentMatchIndex.value];
    }
    return null;
});
const matchCountText = computed(() => {
    if (!searchQuery.value)
        return '';
    if (matches.value.length === 0)
        return 'No results';
    return `${currentMatchIndex.value + 1} of ${matches.value.length}`;
});
// Search logic
function performSearch() {
    matches.value = [];
    currentMatchIndex.value = -1;
    if (!searchQuery.value || !props.content)
        return;
    try {
        let pattern;
        if (useRegex.value) {
            pattern = new RegExp(searchQuery.value, caseSensitive.value ? 'g' : 'gi');
        }
        else {
            // Escape special regex characters for literal search
            let escaped = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (wholeWord.value) {
                escaped = `\\b${escaped}\\b`;
            }
            pattern = new RegExp(escaped, caseSensitive.value ? 'g' : 'gi');
        }
        let match;
        const lines = props.content.split('\n');
        while ((match = pattern.exec(props.content)) !== null) {
            // Calculate line and column
            let pos = 0;
            let line = 0;
            let column = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i]?.length ?? 0;
                if (pos + lineLength >= match.index) {
                    line = i + 1;
                    column = match.index - pos;
                    break;
                }
                pos += lineLength + 1; // +1 for newline
            }
            matches.value.push({
                index: match.index,
                start: match.index,
                end: match.index + match[0].length,
                line,
                column,
                text: match[0]
            });
            // Prevent infinite loop on zero-width matches
            if (match[0].length === 0) {
                pattern.lastIndex++;
            }
        }
        if (matches.value.length > 0 && matches.value[0]) {
            currentMatchIndex.value = 0;
            emit('navigate', matches.value[0]);
        }
    }
    catch (e) {
        // Invalid regex - silently fail
        console.warn('Invalid search pattern:', e);
    }
}
function navigateNext() {
    if (matches.value.length === 0)
        return;
    currentMatchIndex.value = (currentMatchIndex.value + 1) % matches.value.length;
    const match = matches.value[currentMatchIndex.value];
    if (match)
        emit('navigate', match);
}
function navigatePrev() {
    if (matches.value.length === 0)
        return;
    currentMatchIndex.value = currentMatchIndex.value <= 0
        ? matches.value.length - 1
        : currentMatchIndex.value - 1;
    const match = matches.value[currentMatchIndex.value];
    if (match)
        emit('navigate', match);
}
function replaceCurrentMatch() {
    const match = currentMatch.value;
    if (!match)
        return;
    emit('replace', {
        from: match.start,
        to: match.end,
        text: replaceQuery.value
    });
    // Re-search after replacement
    setTimeout(performSearch, 50);
}
function replaceAllMatches() {
    if (matches.value.length === 0)
        return;
    // Build replacements in reverse order to maintain positions
    const replacements = [...matches.value]
        .sort((a, b) => b.start - a.start)
        .map(match => ({
        from: match.start,
        to: match.end,
        text: replaceQuery.value
    }));
    emit('replace-all', replacements);
    // Re-search after replacement
    setTimeout(performSearch, 50);
}
function closePanel() {
    emit('close');
}
// Keyboard shortcuts
function handleKeydown(e) {
    if (e.key === 'Escape') {
        closePanel();
    }
    else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        navigateNext();
    }
    else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        navigatePrev();
    }
    else if (e.key === 'F3') {
        e.preventDefault();
        if (e.shiftKey) {
            navigatePrev();
        }
        else {
            navigateNext();
        }
    }
}
// Watch for query changes with debounce
let searchTimeout;
watch([searchQuery, caseSensitive, wholeWord, useRegex], () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(performSearch, 150);
});
// Watch visibility
watch(() => props.visible, (visible) => {
    if (visible) {
        setTimeout(() => searchInputRef.value?.focus(), 100);
    }
});
// Watch content changes
watch(() => props.content, () => {
    if (searchQuery.value) {
        performSearch();
    }
});
onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
    if (props.visible) {
        searchInputRef.value?.focus();
    }
});
onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    clearTimeout(searchTimeout);
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['replace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['option-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-replace-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['option-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['replace-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['replace-btn']} */ ;
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
Transition;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    name: "slide-down",
}));
const __VLS_2 = __VLS_1({
    name: "slide-down",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
if (__VLS_ctx.visible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "search-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['search-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "search-row" },
    });
    /** @type {__VLS_StyleScopedClasses['search-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "search-input-wrapper" },
    });
    /** @type {__VLS_StyleScopedClasses['search-input-wrapper']} */ ;
    let __VLS_6;
    /** @ts-ignore @type {typeof __VLS_components.Search} */
    Search;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        size: (16),
        ...{ class: "input-icon" },
    }));
    const __VLS_8 = __VLS_7({
        size: (16),
        ...{ class: "input-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    /** @type {__VLS_StyleScopedClasses['input-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeydown: (__VLS_ctx.navigateNext) },
        ref: "searchInputRef",
        value: (__VLS_ctx.searchQuery),
        type: "text",
        placeholder: "Find",
        ...{ class: "search-input" },
    });
    /** @type {__VLS_StyleScopedClasses['search-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "search-options" },
    });
    /** @type {__VLS_StyleScopedClasses['search-options']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.visible))
                    return;
                __VLS_ctx.caseSensitive = !__VLS_ctx.caseSensitive;
                // @ts-ignore
                [visible, navigateNext, searchQuery, caseSensitive, caseSensitive,];
            } },
        ...{ class: "option-btn" },
        ...{ class: ({ active: __VLS_ctx.caseSensitive }) },
        title: "Case Sensitive (Alt+C)",
    });
    /** @type {__VLS_StyleScopedClasses['option-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_11;
    /** @ts-ignore @type {typeof __VLS_components.CaseSensitive} */
    CaseSensitive;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
        size: (16),
    }));
    const __VLS_13 = __VLS_12({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.visible))
                    return;
                __VLS_ctx.wholeWord = !__VLS_ctx.wholeWord;
                // @ts-ignore
                [caseSensitive, wholeWord, wholeWord,];
            } },
        ...{ class: "option-btn" },
        ...{ class: ({ active: __VLS_ctx.wholeWord }) },
        title: "Whole Word (Alt+W)",
    });
    /** @type {__VLS_StyleScopedClasses['option-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_16;
    /** @ts-ignore @type {typeof __VLS_components.WholeWord} */
    WholeWord;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
        size: (16),
    }));
    const __VLS_18 = __VLS_17({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.visible))
                    return;
                __VLS_ctx.useRegex = !__VLS_ctx.useRegex;
                // @ts-ignore
                [wholeWord, useRegex, useRegex,];
            } },
        ...{ class: "option-btn" },
        ...{ class: ({ active: __VLS_ctx.useRegex }) },
        title: "Regular Expression (Alt+R)",
    });
    /** @type {__VLS_StyleScopedClasses['option-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_21;
    /** @ts-ignore @type {typeof __VLS_components.Regex} */
    Regex;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
        size: (16),
    }));
    const __VLS_23 = __VLS_22({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "search-nav" },
    });
    /** @type {__VLS_StyleScopedClasses['search-nav']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "match-count" },
    });
    /** @type {__VLS_StyleScopedClasses['match-count']} */ ;
    (__VLS_ctx.matchCountText);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.navigatePrev) },
        ...{ class: "nav-btn" },
        disabled: (__VLS_ctx.matches.length === 0),
        title: "Previous (Shift+Enter)",
    });
    /** @type {__VLS_StyleScopedClasses['nav-btn']} */ ;
    let __VLS_26;
    /** @ts-ignore @type {typeof __VLS_components.ChevronUp} */
    ChevronUp;
    // @ts-ignore
    const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
        size: (16),
    }));
    const __VLS_28 = __VLS_27({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_27));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.navigateNext) },
        ...{ class: "nav-btn" },
        disabled: (__VLS_ctx.matches.length === 0),
        title: "Next (Enter)",
    });
    /** @type {__VLS_StyleScopedClasses['nav-btn']} */ ;
    let __VLS_31;
    /** @ts-ignore @type {typeof __VLS_components.ChevronDown} */
    ChevronDown;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
        size: (16),
    }));
    const __VLS_33 = __VLS_32({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.visible))
                    return;
                __VLS_ctx.showReplace = !__VLS_ctx.showReplace;
                // @ts-ignore
                [navigateNext, useRegex, matchCountText, navigatePrev, matches, matches, showReplace, showReplace,];
            } },
        ...{ class: "toggle-replace-btn" },
        title: "Toggle Replace",
    });
    /** @type {__VLS_StyleScopedClasses['toggle-replace-btn']} */ ;
    let __VLS_36;
    /** @ts-ignore @type {typeof __VLS_components.Replace} */
    Replace;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
        size: (16),
    }));
    const __VLS_38 = __VLS_37({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closePanel) },
        ...{ class: "close-btn" },
        title: "Close (Esc)",
    });
    /** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
    let __VLS_41;
    /** @ts-ignore @type {typeof __VLS_components.X} */
    X;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
        size: (16),
    }));
    const __VLS_43 = __VLS_42({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    let __VLS_46;
    /** @ts-ignore @type {typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_47 = __VLS_asFunctionalComponent1(__VLS_46, new __VLS_46({
        name: "expand",
    }));
    const __VLS_48 = __VLS_47({
        name: "expand",
    }, ...__VLS_functionalComponentArgsRest(__VLS_47));
    const { default: __VLS_51 } = __VLS_49.slots;
    if (__VLS_ctx.showReplace) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "replace-row" },
        });
        /** @type {__VLS_StyleScopedClasses['replace-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "search-input-wrapper" },
        });
        /** @type {__VLS_StyleScopedClasses['search-input-wrapper']} */ ;
        let __VLS_52;
        /** @ts-ignore @type {typeof __VLS_components.Replace} */
        Replace;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent1(__VLS_52, new __VLS_52({
            size: (16),
            ...{ class: "input-icon" },
        }));
        const __VLS_54 = __VLS_53({
            size: (16),
            ...{ class: "input-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        /** @type {__VLS_StyleScopedClasses['input-icon']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            value: (__VLS_ctx.replaceQuery),
            type: "text",
            placeholder: "Replace",
            ...{ class: "search-input" },
        });
        /** @type {__VLS_StyleScopedClasses['search-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.replaceCurrentMatch) },
            ...{ class: "replace-btn" },
            disabled: (!__VLS_ctx.currentMatch),
            title: "Replace",
        });
        /** @type {__VLS_StyleScopedClasses['replace-btn']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.replaceAllMatches) },
            ...{ class: "replace-btn" },
            disabled: (__VLS_ctx.matches.length === 0),
            title: "Replace All",
        });
        /** @type {__VLS_StyleScopedClasses['replace-btn']} */ ;
    }
    // @ts-ignore
    [matches, showReplace, closePanel, replaceQuery, replaceCurrentMatch, currentMatch, replaceAllMatches,];
    var __VLS_49;
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
