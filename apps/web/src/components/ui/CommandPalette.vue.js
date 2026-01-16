import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Command, X, ChevronRight } from 'lucide-vue-next';
import { useLayoutStore } from '@/stores/layout';
import { useEditorStore } from '@/stores/editor';
import { usePreferencesStore } from '@/stores/preferences';
const layoutStore = useLayoutStore();
const editorStore = useEditorStore();
const preferencesStore = usePreferencesStore();
const searchQuery = ref('');
const selectedIndex = ref(0);
const searchInputRef = ref();
// Define available commands
const commands = computed(() => [
    // File commands
    {
        id: 'new-document',
        label: 'New Document',
        shortcut: 'Ctrl+N',
        category: 'File',
        action: () => editorStore.createDocument()
    },
    {
        id: 'save-document',
        label: 'Save Document',
        shortcut: 'Ctrl+S',
        category: 'File',
        action: () => editorStore.saveDocument()
    },
    // Edit commands
    {
        id: 'find',
        label: 'Find in Document',
        shortcut: 'Ctrl+F',
        category: 'Edit',
        action: () => layoutStore.openSearchPanel()
    },
    // View commands
    {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        shortcut: 'Ctrl+\\',
        category: 'View',
        action: () => layoutStore.toggleSidebar()
    },
    {
        id: 'toggle-source-mode',
        label: layoutStore.isSourceMode ? 'Switch to WYSIWYG Mode' : 'Switch to Source Mode',
        shortcut: 'Ctrl+/',
        category: 'View',
        action: () => layoutStore.toggleEditorMode()
    },
    {
        id: 'toggle-focus-mode',
        label: 'Toggle Focus Mode',
        category: 'View',
        action: () => layoutStore.toggleFocusMode()
    },
    {
        id: 'toggle-zen-mode',
        label: 'Toggle Zen Mode',
        category: 'View',
        action: () => layoutStore.toggleZenMode()
    },
    {
        id: 'show-toc',
        label: 'Show Table of Contents',
        category: 'View',
        action: () => layoutStore.setSidebarPanel('toc')
    },
    {
        id: 'show-documents',
        label: 'Show Documents',
        category: 'View',
        action: () => layoutStore.setSidebarPanel('documents')
    },
    // Theme commands
    {
        id: 'theme-one-dark',
        label: 'Theme: One Dark',
        category: 'Theme',
        action: () => preferencesStore.setTheme('one-dark')
    },
    {
        id: 'theme-dark',
        label: 'Theme: Dark',
        category: 'Theme',
        action: () => preferencesStore.setTheme('dark')
    },
    {
        id: 'theme-material-dark',
        label: 'Theme: Material Dark',
        category: 'Theme',
        action: () => preferencesStore.setTheme('material-dark')
    },
    {
        id: 'theme-ulysses',
        label: 'Theme: Ulysses Light',
        category: 'Theme',
        action: () => preferencesStore.setTheme('ulysses-light')
    },
    {
        id: 'theme-graphite',
        label: 'Theme: Graphite Light',
        category: 'Theme',
        action: () => preferencesStore.setTheme('graphite-light')
    }
]);
// Fuzzy search filter
function fuzzyMatch(text, query) {
    const searchLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    let searchIndex = 0;
    for (let i = 0; i < textLower.length && searchIndex < searchLower.length; i++) {
        if (textLower[i] === searchLower[searchIndex]) {
            searchIndex++;
        }
    }
    return searchIndex === searchLower.length;
}
const filteredCommands = computed(() => {
    if (!searchQuery.value)
        return commands.value;
    return commands.value.filter(cmd => fuzzyMatch(cmd.label, searchQuery.value) ||
        fuzzyMatch(cmd.category, searchQuery.value));
});
// Group by category
const groupedCommands = computed(() => {
    const groups = {};
    for (const cmd of filteredCommands.value) {
        if (!groups[cmd.category]) {
            groups[cmd.category] = [];
        }
        groups[cmd.category].push(cmd);
    }
    return groups;
});
// Flat list for navigation
const flatList = computed(() => {
    const items = [];
    for (const [category, cmds] of Object.entries(groupedCommands.value)) {
        items.push({ type: 'header', label: category });
        items.push(...cmds);
    }
    return items;
});
function executeCommand(cmd) {
    layoutStore.closeCommandPalette();
    cmd.action();
}
function handleKeydown(e) {
    if (!layoutStore.commandPaletteVisible)
        return;
    if (e.key === 'Escape') {
        layoutStore.closeCommandPalette();
    }
    else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateDown();
    }
    else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateUp();
    }
    else if (e.key === 'Enter') {
        e.preventDefault();
        executeSelected();
    }
}
function navigateDown() {
    const commandItems = filteredCommands.value;
    if (commandItems.length === 0)
        return;
    selectedIndex.value = (selectedIndex.value + 1) % commandItems.length;
}
function navigateUp() {
    const commandItems = filteredCommands.value;
    if (commandItems.length === 0)
        return;
    selectedIndex.value = selectedIndex.value <= 0
        ? commandItems.length - 1
        : selectedIndex.value - 1;
}
function executeSelected() {
    const cmd = filteredCommands.value[selectedIndex.value];
    if (cmd) {
        executeCommand(cmd);
    }
}
// Reset on open
watch(() => layoutStore.commandPaletteVisible, (visible) => {
    if (visible) {
        searchQuery.value = '';
        selectedIndex.value = 0;
        nextTick(() => searchInputRef.value?.focus());
    }
});
// Reset selection on search change
watch(searchQuery, () => {
    selectedIndex.value = 0;
});
// Global keyboard shortcut
function handleGlobalKeydown(e) {
    // Cmd/Ctrl + P
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        layoutStore.toggleCommandPalette();
    }
    // Cmd/Ctrl + K (alternative)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        layoutStore.toggleCommandPalette();
    }
}
onMounted(() => {
    document.addEventListener('keydown', handleGlobalKeydown);
    document.addEventListener('keydown', handleKeydown);
});
onUnmounted(() => {
    document.removeEventListener('keydown', handleGlobalKeydown);
    document.removeEventListener('keydown', handleKeydown);
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['palette-input']} */ ;
/** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['command-item']} */ ;
/** @type {__VLS_StyleScopedClasses['command-item']} */ ;
/** @type {__VLS_StyleScopedClasses['command-item']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['command-item']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['command-shortcut']} */ ;
/** @type {__VLS_StyleScopedClasses['command-item']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['command-arrow']} */ ;
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
let __VLS_6;
/** @ts-ignore @type {typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
Transition;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    name: "fade",
}));
const __VLS_8 = __VLS_7({
    name: "fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
const { default: __VLS_11 } = __VLS_9.slots;
if (__VLS_ctx.layoutStore.commandPaletteVisible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.layoutStore.commandPaletteVisible))
                    return;
                __VLS_ctx.layoutStore.closeCommandPalette();
                // @ts-ignore
                [layoutStore, layoutStore,];
            } },
        ...{ class: "command-palette-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['command-palette-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: () => { } },
        ...{ class: "command-palette" },
    });
    /** @type {__VLS_StyleScopedClasses['command-palette']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "palette-header" },
    });
    /** @type {__VLS_StyleScopedClasses['palette-header']} */ ;
    let __VLS_12;
    /** @ts-ignore @type {typeof __VLS_components.Command} */
    Command;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
        size: (18),
        ...{ class: "palette-icon" },
    }));
    const __VLS_14 = __VLS_13({
        size: (18),
        ...{ class: "palette-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    /** @type {__VLS_StyleScopedClasses['palette-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ref: "searchInputRef",
        value: (__VLS_ctx.searchQuery),
        type: "text",
        placeholder: "Type a command or search...",
        ...{ class: "palette-input" },
    });
    /** @type {__VLS_StyleScopedClasses['palette-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.layoutStore.commandPaletteVisible))
                    return;
                __VLS_ctx.layoutStore.closeCommandPalette();
                // @ts-ignore
                [layoutStore, searchQuery,];
            } },
        ...{ class: "close-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
    let __VLS_17;
    /** @ts-ignore @type {typeof __VLS_components.X} */
    X;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
        size: (16),
    }));
    const __VLS_19 = __VLS_18({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "palette-results" },
    });
    /** @type {__VLS_StyleScopedClasses['palette-results']} */ ;
    if (__VLS_ctx.filteredCommands.length > 0) {
        for (const [category, categoryName] of __VLS_vFor((__VLS_ctx.groupedCommands))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (categoryName),
                ...{ class: "command-group" },
            });
            /** @type {__VLS_StyleScopedClasses['command-group']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "group-header" },
            });
            /** @type {__VLS_StyleScopedClasses['group-header']} */ ;
            (categoryName);
            for (const [cmd, idx] of __VLS_vFor((category))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.layoutStore.commandPaletteVisible))
                                return;
                            if (!(__VLS_ctx.filteredCommands.length > 0))
                                return;
                            __VLS_ctx.executeCommand(cmd);
                            // @ts-ignore
                            [filteredCommands, groupedCommands, executeCommand,];
                        } },
                    ...{ onMouseenter: (...[$event]) => {
                            if (!(__VLS_ctx.layoutStore.commandPaletteVisible))
                                return;
                            if (!(__VLS_ctx.filteredCommands.length > 0))
                                return;
                            __VLS_ctx.selectedIndex = __VLS_ctx.filteredCommands.indexOf(cmd);
                            // @ts-ignore
                            [filteredCommands, selectedIndex,];
                        } },
                    key: (cmd.id),
                    ...{ class: "command-item" },
                    ...{ class: ({
                            selected: __VLS_ctx.filteredCommands.indexOf(cmd) === __VLS_ctx.selectedIndex
                        }) },
                });
                /** @type {__VLS_StyleScopedClasses['command-item']} */ ;
                /** @type {__VLS_StyleScopedClasses['selected']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "command-label" },
                });
                /** @type {__VLS_StyleScopedClasses['command-label']} */ ;
                (cmd.label);
                if (cmd.shortcut) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "command-shortcut" },
                    });
                    /** @type {__VLS_StyleScopedClasses['command-shortcut']} */ ;
                    (cmd.shortcut);
                }
                let __VLS_22;
                /** @ts-ignore @type {typeof __VLS_components.ChevronRight} */
                ChevronRight;
                // @ts-ignore
                const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
                    size: (14),
                    ...{ class: "command-arrow" },
                }));
                const __VLS_24 = __VLS_23({
                    size: (14),
                    ...{ class: "command-arrow" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_23));
                /** @type {__VLS_StyleScopedClasses['command-arrow']} */ ;
                // @ts-ignore
                [filteredCommands, selectedIndex,];
            }
            // @ts-ignore
            [];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "no-results" },
        });
        /** @type {__VLS_StyleScopedClasses['no-results']} */ ;
    }
}
// @ts-ignore
[];
var __VLS_9;
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
