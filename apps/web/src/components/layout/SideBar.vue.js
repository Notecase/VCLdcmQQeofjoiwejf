import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { FileText, List, Plus, ChevronRight, Trash2, Folder, FolderOpen, ChevronRight as ChevronRightIcon, MoreHorizontal, Edit2, FolderPlus, FilePlus, Search, Settings, LogOut, Moon, Sun, Monitor, User, MessageCircle, ChevronUp, CornerDownRight } from 'lucide-vue-next';
import { useEditorStore, useLayoutStore, useProjectStore, useAuthStore, usePreferencesStore } from '@/stores';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import TableOfContents from './TableOfContents.vue';
import { buildNoteTree, wouldCreateCircularNote } from '@inkdown/shared';
import * as notesService from '@/services/notes.service';
const router = useRouter();
const editorStore = useEditorStore();
const layoutStore = useLayoutStore();
const projectStore = useProjectStore();
const authStore = useAuthStore();
const preferencesStore = usePreferencesStore();
// User menu state
const showUserMenu = ref(false);
const userMenuRef = ref(null);
// Get user display info
const userDisplayName = computed(() => {
    if (!authStore.user)
        return 'Guest';
    return authStore.user.name || authStore.user.email?.split('@')[0] || 'User';
});
const userInitial = computed(() => {
    return userDisplayName.value.charAt(0).toUpperCase();
});
// Theme handling
const currentTheme = computed(() => {
    const theme = preferencesStore.theme;
    if (theme.includes('dark'))
        return 'dark';
    if (theme.includes('light'))
        return 'light';
    return 'system';
});
function setTheme(mode) {
    if (mode === 'light') {
        preferencesStore.setTheme('light');
    }
    else if (mode === 'dark') {
        preferencesStore.setTheme('one-dark');
    }
    else {
        // System - default to dark for now
        preferencesStore.setTheme('one-dark');
    }
}
function toggleUserMenu() {
    showUserMenu.value = !showUserMenu.value;
}
function closeUserMenu() {
    showUserMenu.value = false;
}
// Click outside to close user menu
function handleClickOutside(e) {
    if (showUserMenu.value && userMenuRef.value && !userMenuRef.value.contains(e.target)) {
        showUserMenu.value = false;
    }
}
onMounted(() => {
    document.addEventListener('click', handleClickOutside);
});
onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
});
function goToSettings() {
    closeUserMenu();
    // TODO: Open settings modal
}
function goToAuth() {
    closeUserMenu();
    router.push('/auth');
}
async function signOut() {
    closeUserMenu();
    await authStore.signOut();
    router.push('/auth');
}
const searchQuery = ref('');
const activeTab = computed({
    get: () => layoutStore.activeSidebarPanel,
    set: (val) => layoutStore.setSidebarPanel(val)
});
const sidebarVisible = computed(() => layoutStore.sidebarVisible);
const sidebarWidth = computed(() => layoutStore.sidebarWidth);
// Project editing state
const editingProjectId = ref(null);
const editingProjectName = ref('');
const editInputRef = ref(null);
// Context menu state
const contextMenu = ref({
    show: false,
    x: 0,
    y: 0,
    type: '',
    targetId: ''
});
// New project input state
const showNewProjectInput = ref(false);
const newProjectName = ref('');
const newProjectParentId = ref(null);
const newProjectInputRef = ref(null);
// Note editing state
const editingNoteId = ref(null);
const editingNoteTitle = ref('');
const noteEditInputRef = ref(null);
// Expanded note IDs (for subnotes)
const expandedNoteIds = ref(new Set());
// Drag-and-drop state
const dragState = ref({
    isDragging: false,
    itemId: null,
    itemType: null,
    dropTargetId: null,
    dropTargetType: null
});
// Filter documents - only root-level general notes (no parent)
const generalDocuments = computed(() => {
    const docs = editorStore.documents.filter(doc => !doc.project_id && !doc.parent_note_id);
    if (!searchQuery.value)
        return docs;
    const query = searchQuery.value.toLowerCase();
    return docs.filter(doc => doc.title.toLowerCase().includes(query));
});
// Build note tree for general notes
const generalNoteTree = computed(() => {
    const generalNotes = editorStore.documents.filter(d => !d.project_id);
    return buildNoteTree(generalNotes);
});
// Get root-level documents for a project (no parent note)
const getProjectDocuments = (projectId) => {
    const docs = editorStore.documents.filter(doc => doc.project_id === projectId && !doc.parent_note_id);
    if (!searchQuery.value)
        return docs;
    const query = searchQuery.value.toLowerCase();
    return docs.filter(doc => doc.title.toLowerCase().includes(query));
};
// Build note tree for a project
const getProjectNoteTree = (projectId) => {
    const projectNotes = editorStore.documents.filter(d => d.project_id === projectId);
    return buildNoteTree(projectNotes);
};
// Get children of a note
const getNoteChildren = (noteId) => {
    return editorStore.documents.filter(doc => doc.parent_note_id === noteId);
};
// Check if a note has children
const hasNoteChildren = (noteId) => {
    return editorStore.documents.some(doc => doc.parent_note_id === noteId);
};
// Check if a note is expanded
const isNoteExpanded = (noteId) => {
    return expandedNoteIds.value.has(noteId);
};
// Toggle note expanded state
const toggleNoteExpanded = (noteId) => {
    if (expandedNoteIds.value.has(noteId)) {
        expandedNoteIds.value.delete(noteId);
    }
    else {
        expandedNoteIds.value.add(noteId);
    }
};
// Load projects on mount
onMounted(async () => {
    await projectStore.loadFolders();
});
// Actions
async function createNewDocument(projectId) {
    await editorStore.createDocument(projectId || undefined);
}
async function openDocument(doc) {
    editorStore.openDocument(doc);
}
async function deleteDocument(doc, e) {
    e.stopPropagation();
    try {
        await ElMessageBox.confirm(`Delete "${doc.title}"? This cannot be undone.`, 'Delete Document', { type: 'warning' });
        await editorStore.deleteDocument(doc.id);
    }
    catch {
        // Cancelled
    }
}
// Project actions
async function createProject(parentId = null) {
    newProjectParentId.value = parentId;
    newProjectName.value = '';
    showNewProjectInput.value = true;
    // If creating under a parent, expand it
    if (parentId) {
        projectStore.expandFolder(parentId);
    }
    await nextTick();
    newProjectInputRef.value?.focus();
}
async function submitNewProject() {
    const name = newProjectName.value.trim();
    if (!name) {
        showNewProjectInput.value = false;
        return;
    }
    const result = await projectStore.createFolder(name, newProjectParentId.value);
    if (result) {
        ElMessage.success(`Created project "${name}"`);
    }
    showNewProjectInput.value = false;
    newProjectName.value = '';
    newProjectParentId.value = null;
}
function cancelNewProject() {
    showNewProjectInput.value = false;
    newProjectName.value = '';
    newProjectParentId.value = null;
}
function startRenameProject(projectId, currentName) {
    editingProjectId.value = projectId;
    editingProjectName.value = currentName;
    nextTick(() => {
        editInputRef.value?.focus();
        editInputRef.value?.select();
    });
}
async function submitRenameProject() {
    if (!editingProjectId.value)
        return;
    const name = editingProjectName.value.trim();
    if (name) {
        await projectStore.renameFolder(editingProjectId.value, name);
    }
    editingProjectId.value = null;
    editingProjectName.value = '';
}
function cancelRenameProject() {
    editingProjectId.value = null;
    editingProjectName.value = '';
}
async function deleteProject(projectId, projectName) {
    try {
        await ElMessageBox.confirm(`Delete project "${projectName}" and all its contents? This cannot be undone.`, 'Delete Project', { type: 'warning', confirmButtonText: 'Delete', confirmButtonClass: 'el-button--danger' });
        await projectStore.deleteFolder(projectId);
        ElMessage.success(`Deleted project "${projectName}"`);
    }
    catch {
        // Cancelled
    }
}
// Note rename functions
function startRenameNote(noteId, currentTitle) {
    editingNoteId.value = noteId;
    editingNoteTitle.value = currentTitle;
    nextTick(() => {
        noteEditInputRef.value?.focus();
        noteEditInputRef.value?.select();
    });
}
async function submitRenameNote() {
    if (!editingNoteId.value)
        return;
    const title = editingNoteTitle.value.trim();
    if (title) {
        await editorStore.renameDocument(editingNoteId.value, title);
        ElMessage.success('Note renamed');
    }
    editingNoteId.value = null;
    editingNoteTitle.value = '';
}
function cancelRenameNote() {
    editingNoteId.value = null;
    editingNoteTitle.value = '';
}
// Subnote creation
async function createSubnote(parentNoteId) {
    // Expand the parent note to show the new subnote
    expandedNoteIds.value.add(parentNoteId);
    await editorStore.createDocument(undefined, 'Untitled', parentNoteId);
    ElMessage.success('Subnote created');
}
// Move note to general (remove from project/parent)
async function moveNoteToGeneral(noteId) {
    const result = await notesService.moveNote(noteId, {
        project_id: null,
        parent_note_id: null
    });
    if (result.error) {
        ElMessage.error('Failed to move note');
    }
    else {
        await editorStore.loadDocuments();
        ElMessage.success('Moved to general notes');
    }
}
// Drag-and-drop handlers
function handleDragStart(e, itemId, itemType) {
    dragState.value = {
        isDragging: true,
        itemId,
        itemType,
        dropTargetId: null,
        dropTargetType: null
    };
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ itemId, itemType }));
    }
    // Add a small delay for visual feedback
    const target = e.target;
    setTimeout(() => target.classList.add('dragging'), 0);
}
function handleDragEnd(e) {
    const target = e.target;
    target.classList.remove('dragging');
    resetDragState();
}
function handleDragOver(e, targetId, targetType) {
    e.preventDefault();
    // Only allow note drags for now
    if (dragState.value.itemType !== 'note')
        return;
    if (!dragState.value.itemId)
        return;
    // Can't drop on itself
    if (dragState.value.itemId === targetId)
        return;
    // Validate drop target for notes
    if (targetType === 'note') {
        const noteTree = buildNoteTree(editorStore.documents);
        if (wouldCreateCircularNote(noteTree, dragState.value.itemId, targetId)) {
            return; // Would create circular reference
        }
    }
    dragState.value.dropTargetId = targetId;
    dragState.value.dropTargetType = targetType;
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
    }
}
function handleDragLeave(e) {
    // Only reset if leaving the actual element (not entering a child)
    const relatedTarget = e.relatedTarget;
    const currentTarget = e.currentTarget;
    if (!currentTarget.contains(relatedTarget)) {
        if (dragState.value.dropTargetId === (currentTarget.dataset.itemId || '')) {
            dragState.value.dropTargetId = null;
            dragState.value.dropTargetType = null;
        }
    }
}
async function handleDrop(e, targetId, targetType) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragState.value.itemId || dragState.value.itemType !== 'note') {
        resetDragState();
        return;
    }
    const noteId = dragState.value.itemId;
    // Determine destination based on target type
    let destination;
    if (targetType === 'project') {
        // Moving to a project (as root note in that project)
        destination = { project_id: targetId, parent_note_id: null };
    }
    else if (targetType === 'note') {
        // Moving under another note (becomes subnote)
        destination = { project_id: null, parent_note_id: targetId };
        // Auto-expand the target note
        expandedNoteIds.value.add(targetId);
    }
    else {
        // Moving to general (no project, no parent)
        destination = { project_id: null, parent_note_id: null };
    }
    const result = await notesService.moveNote(noteId, destination);
    if (result.error) {
        ElMessage.error('Failed to move note');
    }
    else {
        await editorStore.loadDocuments();
        ElMessage.success('Note moved');
    }
    resetDragState();
}
function resetDragState() {
    dragState.value = {
        isDragging: false,
        itemId: null,
        itemType: null,
        dropTargetId: null,
        dropTargetType: null
    };
}
// Context menu
function showContextMenu(e, type, id) {
    e.preventDefault();
    e.stopPropagation();
    contextMenu.value = {
        show: true,
        x: e.clientX,
        y: e.clientY,
        type,
        targetId: id
    };
}
function hideContextMenu() {
    contextMenu.value.show = false;
}
function handleContextMenuAction(action) {
    const { type, targetId } = contextMenu.value;
    if (type === 'project') {
        const project = projectStore.folders.find(f => f.id === targetId);
        if (!project)
            return;
        switch (action) {
            case 'rename':
                startRenameProject(targetId, project.name);
                break;
            case 'newNote':
                createNewDocument(targetId);
                break;
            case 'newSubproject':
                createProject(targetId);
                break;
            case 'delete':
                deleteProject(targetId, project.name);
                break;
        }
    }
    else if (type === 'note') {
        const doc = editorStore.documents.find(d => d.id === targetId);
        if (!doc)
            return;
        switch (action) {
            case 'rename':
                startRenameNote(targetId, doc.title);
                break;
            case 'newSubnote':
                createSubnote(targetId);
                break;
            case 'moveToGeneral':
                moveNoteToGeneral(targetId);
                break;
            case 'delete':
                deleteDocument(doc, new MouseEvent('click'));
                break;
        }
    }
    hideContextMenu();
}
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000)
        return 'Just now';
    if (diff < 3600000)
        return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000)
        return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
}
function toggleSidebar() {
    layoutStore.toggleSidebar();
}
function isProjectExpanded(id) {
    return projectStore.expandedFolderIds.has(id);
}
function toggleProjectExpanded(id) {
    projectStore.toggleFolderExpanded(id);
}
// Close context menu on click outside
function onDocumentClick() {
    hideContextMenu();
}
// Tab definitions
const tabs = [
    { id: 'documents', icon: FileText, label: 'Documents' },
    { id: 'toc', icon: List, label: 'Table of Contents' }
];
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['collapsed-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['collapsed-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-search']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-search']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-search']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['more-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['more-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-project']} */ ;
/** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-section']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-over']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-over']} */ ;
/** @type {__VLS_StyleScopedClasses['new-item-input']} */ ;
/** @type {__VLS_StyleScopedClasses['new-item-input']} */ ;
/** @type {__VLS_StyleScopedClasses['add-doc-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['general-section']} */ ;
/** @type {__VLS_StyleScopedClasses['toc-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['toc-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['context-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['context-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['context-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['context-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['user-profile-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['user-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['rotated']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
    ...{ onClick: (__VLS_ctx.onDocumentClick) },
    ...{ class: "sidebar" },
    ...{ class: ({ collapsed: !__VLS_ctx.sidebarVisible }) },
    ...{ style: ({ width: __VLS_ctx.sidebarVisible ? `${__VLS_ctx.sidebarWidth}px` : '48px' }) },
});
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['collapsed']} */ ;
if (!__VLS_ctx.sidebarVisible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "sidebar-collapsed" },
    });
    /** @type {__VLS_StyleScopedClasses['sidebar-collapsed']} */ ;
    for (const [tab] of __VLS_vFor((__VLS_ctx.tabs))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.activeTab = tab.id;
                    __VLS_ctx.layoutStore.toggleSidebar();
                    // @ts-ignore
                    [onDocumentClick, sidebarVisible, sidebarVisible, sidebarVisible, sidebarWidth, tabs, activeTab, layoutStore,];
                } },
            key: (tab.id),
            ...{ class: "collapsed-tab-btn" },
            ...{ class: ({ active: __VLS_ctx.activeTab === tab.id }) },
            title: (tab.label),
        });
        /** @type {__VLS_StyleScopedClasses['collapsed-tab-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        const __VLS_0 = (tab.icon);
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            size: (18),
        }));
        const __VLS_2 = __VLS_1({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        // @ts-ignore
        [activeTab,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spacer" },
    });
    /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.toggleSidebar) },
        ...{ class: "collapsed-tab-btn" },
        title: "Expand Sidebar",
    });
    /** @type {__VLS_StyleScopedClasses['collapsed-tab-btn']} */ ;
    let __VLS_5;
    /** @ts-ignore @type {typeof __VLS_components.ChevronRight} */
    ChevronRight;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        size: (18),
    }));
    const __VLS_7 = __VLS_6({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "sidebar-expanded" },
    });
    /** @type {__VLS_StyleScopedClasses['sidebar-expanded']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "quick-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['quick-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.sidebarVisible))
                    return;
                __VLS_ctx.createNewDocument();
                // @ts-ignore
                [toggleSidebar, createNewDocument,];
            } },
        ...{ class: "quick-action-btn primary" },
        title: "New Document",
    });
    /** @type {__VLS_StyleScopedClasses['quick-action-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    let __VLS_10;
    /** @ts-ignore @type {typeof __VLS_components.FilePlus} */
    FilePlus;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        size: (18),
    }));
    const __VLS_12 = __VLS_11({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.sidebarVisible))
                    return;
                __VLS_ctx.createProject(null);
                // @ts-ignore
                [createProject,];
            } },
        ...{ class: "quick-action-btn" },
        title: "New Project",
    });
    /** @type {__VLS_StyleScopedClasses['quick-action-btn']} */ ;
    let __VLS_15;
    /** @ts-ignore @type {typeof __VLS_components.FolderPlus} */
    FolderPlus;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
        size: (18),
    }));
    const __VLS_17 = __VLS_16({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel documents-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['documents-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel-search" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-search']} */ ;
    let __VLS_20;
    /** @ts-ignore @type {typeof __VLS_components.Search} */
    Search;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
        size: (14),
        ...{ class: "search-icon" },
    }));
    const __VLS_22 = __VLS_21({
        size: (14),
        ...{ class: "search-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    /** @type {__VLS_StyleScopedClasses['search-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.searchQuery),
        type: "text",
        placeholder: "Search...",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tree-view" },
    });
    /** @type {__VLS_StyleScopedClasses['tree-view']} */ ;
    for (const [project] of __VLS_vFor((__VLS_ctx.projectStore.rootFolders))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "tree-section" },
            key: (project.id),
        });
        /** @type {__VLS_StyleScopedClasses['tree-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.toggleProjectExpanded(project.id);
                    // @ts-ignore
                    [searchQuery, projectStore, toggleProjectExpanded,];
                } },
            ...{ onContextmenu: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.showContextMenu($event, 'project', project.id);
                    // @ts-ignore
                    [showContextMenu,];
                } },
            ...{ onDragover: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.handleDragOver($event, project.id, 'project');
                    // @ts-ignore
                    [handleDragOver,];
                } },
            ...{ onDragleave: (__VLS_ctx.handleDragLeave) },
            ...{ onDrop: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.handleDrop($event, project.id, 'project');
                    // @ts-ignore
                    [handleDragLeave, handleDrop,];
                } },
            ...{ class: "tree-item project-item" },
            ...{ class: ({
                    expanded: __VLS_ctx.isProjectExpanded(project.id),
                    'drag-over': __VLS_ctx.dragState.dropTargetId === project.id && __VLS_ctx.dragState.dropTargetType === 'project'
                }) },
            'data-item-id': (project.id),
        });
        /** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['project-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
        /** @type {__VLS_StyleScopedClasses['drag-over']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.toggleProjectExpanded(project.id);
                    // @ts-ignore
                    [toggleProjectExpanded, isProjectExpanded, dragState, dragState,];
                } },
            ...{ class: "expand-btn" },
        });
        /** @type {__VLS_StyleScopedClasses['expand-btn']} */ ;
        let __VLS_25;
        /** @ts-ignore @type {typeof __VLS_components.ChevronRightIcon} */
        ChevronRightIcon;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
            size: (14),
            ...{ class: ({ rotated: __VLS_ctx.isProjectExpanded(project.id) }) },
        }));
        const __VLS_27 = __VLS_26({
            size: (14),
            ...{ class: ({ rotated: __VLS_ctx.isProjectExpanded(project.id) }) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_26));
        /** @type {__VLS_StyleScopedClasses['rotated']} */ ;
        const __VLS_30 = (__VLS_ctx.isProjectExpanded(project.id) ? __VLS_ctx.FolderOpen : __VLS_ctx.Folder);
        // @ts-ignore
        const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
            size: (16),
            ...{ class: "item-icon folder-icon" },
        }));
        const __VLS_32 = __VLS_31({
            size: (16),
            ...{ class: "item-icon folder-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_31));
        /** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
        /** @type {__VLS_StyleScopedClasses['folder-icon']} */ ;
        if (__VLS_ctx.editingProjectId === project.id) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (__VLS_ctx.submitRenameProject) },
                ...{ onKeyup: (__VLS_ctx.cancelRenameProject) },
                ...{ onBlur: (__VLS_ctx.submitRenameProject) },
                ...{ onClick: () => { } },
                ref: "editInputRef",
                ...{ class: "inline-edit" },
            });
            (__VLS_ctx.editingProjectName);
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "item-name" },
            });
            /** @type {__VLS_StyleScopedClasses['item-name']} */ ;
            (project.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "item-count" },
            });
            /** @type {__VLS_StyleScopedClasses['item-count']} */ ;
            (__VLS_ctx.getProjectDocuments(project.id).length);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.showContextMenu($event, 'project', project.id);
                    // @ts-ignore
                    [showContextMenu, isProjectExpanded, isProjectExpanded, FolderOpen, Folder, editingProjectId, submitRenameProject, submitRenameProject, cancelRenameProject, editingProjectName, getProjectDocuments,];
                } },
            ...{ class: "more-btn" },
            title: "More actions",
        });
        /** @type {__VLS_StyleScopedClasses['more-btn']} */ ;
        let __VLS_35;
        /** @ts-ignore @type {typeof __VLS_components.MoreHorizontal} */
        MoreHorizontal;
        // @ts-ignore
        const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
            size: (14),
        }));
        const __VLS_37 = __VLS_36({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_36));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "tree-children" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isProjectExpanded(project.id)) }, null, null);
        /** @type {__VLS_StyleScopedClasses['tree-children']} */ ;
        if (__VLS_ctx.showNewProjectInput && __VLS_ctx.newProjectParentId === project.id) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "new-item-input" },
            });
            /** @type {__VLS_StyleScopedClasses['new-item-input']} */ ;
            let __VLS_40;
            /** @ts-ignore @type {typeof __VLS_components.Folder} */
            Folder;
            // @ts-ignore
            const __VLS_41 = __VLS_asFunctionalComponent1(__VLS_40, new __VLS_40({
                size: (14),
                ...{ class: "item-icon folder-icon" },
            }));
            const __VLS_42 = __VLS_41({
                size: (14),
                ...{ class: "item-icon folder-icon" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_41));
            /** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
            /** @type {__VLS_StyleScopedClasses['folder-icon']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (__VLS_ctx.submitNewProject) },
                ...{ onKeyup: (__VLS_ctx.cancelNewProject) },
                ...{ onBlur: (__VLS_ctx.submitNewProject) },
                ref: "newProjectInputRef",
                placeholder: "Project name...",
            });
            (__VLS_ctx.newProjectName);
        }
        for (const [subproject] of __VLS_vFor((__VLS_ctx.projectStore.folders.filter(f => f.parent_id === project.id)))) {
            (subproject.id);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.toggleProjectExpanded(subproject.id);
                        // @ts-ignore
                        [projectStore, toggleProjectExpanded, isProjectExpanded, showNewProjectInput, newProjectParentId, submitNewProject, submitNewProject, cancelNewProject, newProjectName,];
                    } },
                ...{ onContextmenu: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.showContextMenu($event, 'project', subproject.id);
                        // @ts-ignore
                        [showContextMenu,];
                    } },
                ...{ onDragover: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.handleDragOver($event, subproject.id, 'project');
                        // @ts-ignore
                        [handleDragOver,];
                    } },
                ...{ onDragleave: (__VLS_ctx.handleDragLeave) },
                ...{ onDrop: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.handleDrop($event, subproject.id, 'project');
                        // @ts-ignore
                        [handleDragLeave, handleDrop,];
                    } },
                ...{ class: "tree-item project-item sub-project" },
                ...{ class: ({
                        'drag-over': __VLS_ctx.dragState.dropTargetId === subproject.id && __VLS_ctx.dragState.dropTargetType === 'project'
                    }) },
                'data-item-id': (subproject.id),
            });
            /** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
            /** @type {__VLS_StyleScopedClasses['project-item']} */ ;
            /** @type {__VLS_StyleScopedClasses['sub-project']} */ ;
            /** @type {__VLS_StyleScopedClasses['drag-over']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.toggleProjectExpanded(subproject.id);
                        // @ts-ignore
                        [toggleProjectExpanded, dragState, dragState,];
                    } },
                ...{ class: "expand-btn" },
            });
            /** @type {__VLS_StyleScopedClasses['expand-btn']} */ ;
            let __VLS_45;
            /** @ts-ignore @type {typeof __VLS_components.ChevronRightIcon} */
            ChevronRightIcon;
            // @ts-ignore
            const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
                size: (14),
                ...{ class: ({ rotated: __VLS_ctx.isProjectExpanded(subproject.id) }) },
            }));
            const __VLS_47 = __VLS_46({
                size: (14),
                ...{ class: ({ rotated: __VLS_ctx.isProjectExpanded(subproject.id) }) },
            }, ...__VLS_functionalComponentArgsRest(__VLS_46));
            /** @type {__VLS_StyleScopedClasses['rotated']} */ ;
            const __VLS_50 = (__VLS_ctx.isProjectExpanded(subproject.id) ? __VLS_ctx.FolderOpen : __VLS_ctx.Folder);
            // @ts-ignore
            const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
                size: (14),
                ...{ class: "item-icon folder-icon" },
            }));
            const __VLS_52 = __VLS_51({
                size: (14),
                ...{ class: "item-icon folder-icon" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_51));
            /** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
            /** @type {__VLS_StyleScopedClasses['folder-icon']} */ ;
            if (__VLS_ctx.editingProjectId === subproject.id) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    ...{ onKeyup: (__VLS_ctx.submitRenameProject) },
                    ...{ onKeyup: (__VLS_ctx.cancelRenameProject) },
                    ...{ onBlur: (__VLS_ctx.submitRenameProject) },
                    ...{ onClick: () => { } },
                    ref: "editInputRef",
                    ...{ class: "inline-edit" },
                });
                (__VLS_ctx.editingProjectName);
                /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "item-name" },
                });
                /** @type {__VLS_StyleScopedClasses['item-name']} */ ;
                (subproject.name);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "item-count" },
                });
                /** @type {__VLS_StyleScopedClasses['item-count']} */ ;
                (__VLS_ctx.getProjectDocuments(subproject.id).length);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.showContextMenu($event, 'project', subproject.id);
                        // @ts-ignore
                        [showContextMenu, isProjectExpanded, isProjectExpanded, FolderOpen, Folder, editingProjectId, submitRenameProject, submitRenameProject, cancelRenameProject, editingProjectName, getProjectDocuments,];
                    } },
                ...{ class: "more-btn" },
            });
            /** @type {__VLS_StyleScopedClasses['more-btn']} */ ;
            let __VLS_55;
            /** @ts-ignore @type {typeof __VLS_components.MoreHorizontal} */
            MoreHorizontal;
            // @ts-ignore
            const __VLS_56 = __VLS_asFunctionalComponent1(__VLS_55, new __VLS_55({
                size: (14),
            }));
            const __VLS_57 = __VLS_56({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_56));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "tree-children" },
            });
            __VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isProjectExpanded(subproject.id)) }, null, null);
            /** @type {__VLS_StyleScopedClasses['tree-children']} */ ;
            for (const [doc] of __VLS_vFor((__VLS_ctx.getProjectDocuments(subproject.id)))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            __VLS_ctx.openDocument(doc);
                            // @ts-ignore
                            [isProjectExpanded, getProjectDocuments, openDocument,];
                        } },
                    ...{ onContextmenu: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            __VLS_ctx.showContextMenu($event, 'note', doc.id);
                            // @ts-ignore
                            [showContextMenu,];
                        } },
                    key: (doc.id),
                    ...{ class: "tree-item doc-item" },
                    ...{ class: ({ active: __VLS_ctx.editorStore.currentDocument?.id === doc.id }) },
                });
                /** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
                /** @type {__VLS_StyleScopedClasses['doc-item']} */ ;
                /** @type {__VLS_StyleScopedClasses['active']} */ ;
                let __VLS_60;
                /** @ts-ignore @type {typeof __VLS_components.FileText} */
                FileText;
                // @ts-ignore
                const __VLS_61 = __VLS_asFunctionalComponent1(__VLS_60, new __VLS_60({
                    size: (14),
                    ...{ class: "item-icon doc-icon" },
                }));
                const __VLS_62 = __VLS_61({
                    size: (14),
                    ...{ class: "item-icon doc-icon" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_61));
                /** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
                /** @type {__VLS_StyleScopedClasses['doc-icon']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "item-name" },
                });
                /** @type {__VLS_StyleScopedClasses['item-name']} */ ;
                (doc.title);
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            __VLS_ctx.deleteDocument(doc, $event);
                            // @ts-ignore
                            [editorStore, deleteDocument,];
                        } },
                    ...{ class: "delete-btn" },
                    title: "Delete",
                });
                /** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
                let __VLS_65;
                /** @ts-ignore @type {typeof __VLS_components.Trash2} */
                Trash2;
                // @ts-ignore
                const __VLS_66 = __VLS_asFunctionalComponent1(__VLS_65, new __VLS_65({
                    size: (12),
                }));
                const __VLS_67 = __VLS_66({
                    size: (12),
                }, ...__VLS_functionalComponentArgsRest(__VLS_66));
                // @ts-ignore
                [];
            }
            // @ts-ignore
            [];
        }
        for (const [doc] of __VLS_vFor((__VLS_ctx.getProjectDocuments(project.id)))) {
            (doc.id);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.hasNoteChildren(doc.id) ? __VLS_ctx.toggleNoteExpanded(doc.id) : __VLS_ctx.openDocument(doc);
                        // @ts-ignore
                        [getProjectDocuments, openDocument, hasNoteChildren, toggleNoteExpanded,];
                    } },
                ...{ onDblclick: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.openDocument(doc);
                        // @ts-ignore
                        [openDocument,];
                    } },
                ...{ onContextmenu: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.showContextMenu($event, 'note', doc.id);
                        // @ts-ignore
                        [showContextMenu,];
                    } },
                ...{ onDragstart: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.handleDragStart($event, doc.id, 'note');
                        // @ts-ignore
                        [handleDragStart,];
                    } },
                ...{ onDragend: (__VLS_ctx.handleDragEnd) },
                ...{ onDragover: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.handleDragOver($event, doc.id, 'note');
                        // @ts-ignore
                        [handleDragOver, handleDragEnd,];
                    } },
                ...{ onDragleave: (__VLS_ctx.handleDragLeave) },
                ...{ onDrop: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.handleDrop($event, doc.id, 'note');
                        // @ts-ignore
                        [handleDragLeave, handleDrop,];
                    } },
                ...{ class: "tree-item doc-item" },
                ...{ class: ({
                        active: __VLS_ctx.editorStore.currentDocument?.id === doc.id,
                        'drag-over': __VLS_ctx.dragState.dropTargetId === doc.id
                    }) },
                'data-item-id': (doc.id),
                draggable: "true",
            });
            /** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
            /** @type {__VLS_StyleScopedClasses['doc-item']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            /** @type {__VLS_StyleScopedClasses['drag-over']} */ ;
            if (__VLS_ctx.hasNoteChildren(doc.id)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            if (!(__VLS_ctx.hasNoteChildren(doc.id)))
                                return;
                            __VLS_ctx.toggleNoteExpanded(doc.id);
                            // @ts-ignore
                            [dragState, editorStore, hasNoteChildren, toggleNoteExpanded,];
                        } },
                    ...{ class: "expand-btn" },
                });
                /** @type {__VLS_StyleScopedClasses['expand-btn']} */ ;
                let __VLS_70;
                /** @ts-ignore @type {typeof __VLS_components.ChevronRightIcon} */
                ChevronRightIcon;
                // @ts-ignore
                const __VLS_71 = __VLS_asFunctionalComponent1(__VLS_70, new __VLS_70({
                    size: (14),
                    ...{ class: ({ rotated: __VLS_ctx.isNoteExpanded(doc.id) }) },
                }));
                const __VLS_72 = __VLS_71({
                    size: (14),
                    ...{ class: ({ rotated: __VLS_ctx.isNoteExpanded(doc.id) }) },
                }, ...__VLS_functionalComponentArgsRest(__VLS_71));
                /** @type {__VLS_StyleScopedClasses['rotated']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "expand-placeholder" },
                });
                /** @type {__VLS_StyleScopedClasses['expand-placeholder']} */ ;
            }
            let __VLS_75;
            /** @ts-ignore @type {typeof __VLS_components.FileText} */
            FileText;
            // @ts-ignore
            const __VLS_76 = __VLS_asFunctionalComponent1(__VLS_75, new __VLS_75({
                size: (14),
                ...{ class: "item-icon doc-icon" },
            }));
            const __VLS_77 = __VLS_76({
                size: (14),
                ...{ class: "item-icon doc-icon" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_76));
            /** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
            /** @type {__VLS_StyleScopedClasses['doc-icon']} */ ;
            if (__VLS_ctx.editingNoteId === doc.id) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    ...{ onKeyup: (__VLS_ctx.submitRenameNote) },
                    ...{ onKeyup: (__VLS_ctx.cancelRenameNote) },
                    ...{ onBlur: (__VLS_ctx.submitRenameNote) },
                    ...{ onClick: () => { } },
                    ref: "noteEditInputRef",
                    ...{ class: "inline-edit" },
                });
                (__VLS_ctx.editingNoteTitle);
                /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "item-name" },
                });
                /** @type {__VLS_StyleScopedClasses['item-name']} */ ;
                (doc.title);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        __VLS_ctx.deleteDocument(doc, $event);
                        // @ts-ignore
                        [deleteDocument, isNoteExpanded, editingNoteId, submitRenameNote, submitRenameNote, cancelRenameNote, editingNoteTitle,];
                    } },
                ...{ class: "delete-btn" },
                title: "Delete",
            });
            /** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
            let __VLS_80;
            /** @ts-ignore @type {typeof __VLS_components.Trash2} */
            Trash2;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent1(__VLS_80, new __VLS_80({
                size: (12),
            }));
            const __VLS_82 = __VLS_81({
                size: (12),
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
            if (__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "tree-children subnotes" },
                });
                /** @type {__VLS_StyleScopedClasses['tree-children']} */ ;
                /** @type {__VLS_StyleScopedClasses['subnotes']} */ ;
                for (const [subnote] of __VLS_vFor((__VLS_ctx.getNoteChildren(doc.id)))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(!__VLS_ctx.sidebarVisible))
                                    return;
                                if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                    return;
                                __VLS_ctx.openDocument(subnote);
                                // @ts-ignore
                                [openDocument, hasNoteChildren, isNoteExpanded, getNoteChildren,];
                            } },
                        ...{ onContextmenu: (...[$event]) => {
                                if (!!(!__VLS_ctx.sidebarVisible))
                                    return;
                                if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                    return;
                                __VLS_ctx.showContextMenu($event, 'note', subnote.id);
                                // @ts-ignore
                                [showContextMenu,];
                            } },
                        ...{ onDragstart: (...[$event]) => {
                                if (!!(!__VLS_ctx.sidebarVisible))
                                    return;
                                if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                    return;
                                __VLS_ctx.handleDragStart($event, subnote.id, 'note');
                                // @ts-ignore
                                [handleDragStart,];
                            } },
                        ...{ onDragend: (__VLS_ctx.handleDragEnd) },
                        ...{ onDragover: (...[$event]) => {
                                if (!!(!__VLS_ctx.sidebarVisible))
                                    return;
                                if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                    return;
                                __VLS_ctx.handleDragOver($event, subnote.id, 'note');
                                // @ts-ignore
                                [handleDragOver, handleDragEnd,];
                            } },
                        ...{ onDragleave: (__VLS_ctx.handleDragLeave) },
                        ...{ onDrop: (...[$event]) => {
                                if (!!(!__VLS_ctx.sidebarVisible))
                                    return;
                                if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                    return;
                                __VLS_ctx.handleDrop($event, subnote.id, 'note');
                                // @ts-ignore
                                [handleDragLeave, handleDrop,];
                            } },
                        ...{ class: "tree-item doc-item subnote" },
                        ...{ class: ({
                                active: __VLS_ctx.editorStore.currentDocument?.id === subnote.id,
                                'drag-over': __VLS_ctx.dragState.dropTargetId === subnote.id
                            }) },
                        'data-item-id': (subnote.id),
                        draggable: "true",
                        key: (subnote.id),
                    });
                    /** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
                    /** @type {__VLS_StyleScopedClasses['doc-item']} */ ;
                    /** @type {__VLS_StyleScopedClasses['subnote']} */ ;
                    /** @type {__VLS_StyleScopedClasses['active']} */ ;
                    /** @type {__VLS_StyleScopedClasses['drag-over']} */ ;
                    let __VLS_85;
                    /** @ts-ignore @type {typeof __VLS_components.CornerDownRight} */
                    CornerDownRight;
                    // @ts-ignore
                    const __VLS_86 = __VLS_asFunctionalComponent1(__VLS_85, new __VLS_85({
                        size: (12),
                        ...{ class: "subnote-indicator" },
                    }));
                    const __VLS_87 = __VLS_86({
                        size: (12),
                        ...{ class: "subnote-indicator" },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_86));
                    /** @type {__VLS_StyleScopedClasses['subnote-indicator']} */ ;
                    let __VLS_90;
                    /** @ts-ignore @type {typeof __VLS_components.FileText} */
                    FileText;
                    // @ts-ignore
                    const __VLS_91 = __VLS_asFunctionalComponent1(__VLS_90, new __VLS_90({
                        size: (14),
                        ...{ class: "item-icon doc-icon" },
                    }));
                    const __VLS_92 = __VLS_91({
                        size: (14),
                        ...{ class: "item-icon doc-icon" },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_91));
                    /** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
                    /** @type {__VLS_StyleScopedClasses['doc-icon']} */ ;
                    if (__VLS_ctx.editingNoteId === subnote.id) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                            ...{ onKeyup: (__VLS_ctx.submitRenameNote) },
                            ...{ onKeyup: (__VLS_ctx.cancelRenameNote) },
                            ...{ onBlur: (__VLS_ctx.submitRenameNote) },
                            ...{ onClick: () => { } },
                            ref: "noteEditInputRef",
                            ...{ class: "inline-edit" },
                        });
                        (__VLS_ctx.editingNoteTitle);
                        /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "item-name" },
                        });
                        /** @type {__VLS_StyleScopedClasses['item-name']} */ ;
                        (subnote.title);
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(!__VLS_ctx.sidebarVisible))
                                    return;
                                if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                    return;
                                __VLS_ctx.deleteDocument(subnote, $event);
                                // @ts-ignore
                                [dragState, editorStore, deleteDocument, editingNoteId, submitRenameNote, submitRenameNote, cancelRenameNote, editingNoteTitle,];
                            } },
                        ...{ class: "delete-btn" },
                        title: "Delete",
                    });
                    /** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
                    let __VLS_95;
                    /** @ts-ignore @type {typeof __VLS_components.Trash2} */
                    Trash2;
                    // @ts-ignore
                    const __VLS_96 = __VLS_asFunctionalComponent1(__VLS_95, new __VLS_95({
                        size: (12),
                    }));
                    const __VLS_97 = __VLS_96({
                        size: (12),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_96));
                    // @ts-ignore
                    [];
                }
            }
            // @ts-ignore
            [];
        }
        if (__VLS_ctx.getProjectDocuments(project.id).length === 0 && __VLS_ctx.projectStore.folders.filter(f => f.parent_id === project.id).length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "empty-project" },
            });
            /** @type {__VLS_StyleScopedClasses['empty-project']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        if (!(__VLS_ctx.getProjectDocuments(project.id).length === 0 && __VLS_ctx.projectStore.folders.filter(f => f.parent_id === project.id).length === 0))
                            return;
                        __VLS_ctx.createNewDocument(project.id);
                        // @ts-ignore
                        [createNewDocument, projectStore, getProjectDocuments,];
                    } },
                ...{ class: "add-doc-btn" },
            });
            /** @type {__VLS_StyleScopedClasses['add-doc-btn']} */ ;
            let __VLS_100;
            /** @ts-ignore @type {typeof __VLS_components.Plus} */
            Plus;
            // @ts-ignore
            const __VLS_101 = __VLS_asFunctionalComponent1(__VLS_100, new __VLS_100({
                size: (12),
            }));
            const __VLS_102 = __VLS_101({
                size: (12),
            }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        }
        // @ts-ignore
        [];
    }
    if (__VLS_ctx.showNewProjectInput && __VLS_ctx.newProjectParentId === null) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "new-item-input root-level" },
        });
        /** @type {__VLS_StyleScopedClasses['new-item-input']} */ ;
        /** @type {__VLS_StyleScopedClasses['root-level']} */ ;
        let __VLS_105;
        /** @ts-ignore @type {typeof __VLS_components.Folder} */
        Folder;
        // @ts-ignore
        const __VLS_106 = __VLS_asFunctionalComponent1(__VLS_105, new __VLS_105({
            size: (16),
            ...{ class: "item-icon folder-icon" },
        }));
        const __VLS_107 = __VLS_106({
            size: (16),
            ...{ class: "item-icon folder-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_106));
        /** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
        /** @type {__VLS_StyleScopedClasses['folder-icon']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onKeyup: (__VLS_ctx.submitNewProject) },
            ...{ onKeyup: (__VLS_ctx.cancelNewProject) },
            ...{ onBlur: (__VLS_ctx.submitNewProject) },
            ref: "newProjectInputRef",
            placeholder: "Project name...",
        });
        (__VLS_ctx.newProjectName);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onDragover: (...[$event]) => {
                if (!!(!__VLS_ctx.sidebarVisible))
                    return;
                __VLS_ctx.handleDragOver($event, '', 'general');
                // @ts-ignore
                [handleDragOver, showNewProjectInput, newProjectParentId, submitNewProject, submitNewProject, cancelNewProject, newProjectName,];
            } },
        ...{ onDragleave: (__VLS_ctx.handleDragLeave) },
        ...{ onDrop: (...[$event]) => {
                if (!!(!__VLS_ctx.sidebarVisible))
                    return;
                __VLS_ctx.handleDrop($event, '', 'general');
                // @ts-ignore
                [handleDragLeave, handleDrop,];
            } },
        ...{ class: "tree-section general-section" },
        ...{ class: ({ 'drag-over': __VLS_ctx.dragState.dropTargetType === 'general' }) },
    });
    /** @type {__VLS_StyleScopedClasses['tree-section']} */ ;
    /** @type {__VLS_StyleScopedClasses['general-section']} */ ;
    /** @type {__VLS_StyleScopedClasses['drag-over']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-header" },
    });
    /** @type {__VLS_StyleScopedClasses['section-header']} */ ;
    let __VLS_110;
    /** @ts-ignore @type {typeof __VLS_components.FileText} */
    FileText;
    // @ts-ignore
    const __VLS_111 = __VLS_asFunctionalComponent1(__VLS_110, new __VLS_110({
        size: (14),
        ...{ class: "section-icon" },
    }));
    const __VLS_112 = __VLS_111({
        size: (14),
        ...{ class: "section-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_111));
    /** @type {__VLS_StyleScopedClasses['section-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "item-count" },
    });
    /** @type {__VLS_StyleScopedClasses['item-count']} */ ;
    (__VLS_ctx.generalDocuments.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tree-children" },
    });
    /** @type {__VLS_StyleScopedClasses['tree-children']} */ ;
    for (const [doc] of __VLS_vFor((__VLS_ctx.generalDocuments))) {
        (doc.id);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.hasNoteChildren(doc.id) ? __VLS_ctx.toggleNoteExpanded(doc.id) : __VLS_ctx.openDocument(doc);
                    // @ts-ignore
                    [dragState, openDocument, hasNoteChildren, toggleNoteExpanded, generalDocuments, generalDocuments,];
                } },
            ...{ onDblclick: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.openDocument(doc);
                    // @ts-ignore
                    [openDocument,];
                } },
            ...{ onContextmenu: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.showContextMenu($event, 'note', doc.id);
                    // @ts-ignore
                    [showContextMenu,];
                } },
            ...{ onDragstart: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.handleDragStart($event, doc.id, 'note');
                    // @ts-ignore
                    [handleDragStart,];
                } },
            ...{ onDragend: (__VLS_ctx.handleDragEnd) },
            ...{ onDragover: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.handleDragOver($event, doc.id, 'note');
                    // @ts-ignore
                    [handleDragOver, handleDragEnd,];
                } },
            ...{ onDragleave: (__VLS_ctx.handleDragLeave) },
            ...{ onDrop: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.handleDrop($event, doc.id, 'note');
                    // @ts-ignore
                    [handleDragLeave, handleDrop,];
                } },
            ...{ class: "tree-item doc-item" },
            ...{ class: ({
                    active: __VLS_ctx.editorStore.currentDocument?.id === doc.id,
                    'drag-over': __VLS_ctx.dragState.dropTargetId === doc.id
                }) },
            'data-item-id': (doc.id),
            draggable: "true",
        });
        /** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['doc-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        /** @type {__VLS_StyleScopedClasses['drag-over']} */ ;
        if (__VLS_ctx.hasNoteChildren(doc.id)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.sidebarVisible))
                            return;
                        if (!(__VLS_ctx.hasNoteChildren(doc.id)))
                            return;
                        __VLS_ctx.toggleNoteExpanded(doc.id);
                        // @ts-ignore
                        [dragState, editorStore, hasNoteChildren, toggleNoteExpanded,];
                    } },
                ...{ class: "expand-btn" },
            });
            /** @type {__VLS_StyleScopedClasses['expand-btn']} */ ;
            let __VLS_115;
            /** @ts-ignore @type {typeof __VLS_components.ChevronRightIcon} */
            ChevronRightIcon;
            // @ts-ignore
            const __VLS_116 = __VLS_asFunctionalComponent1(__VLS_115, new __VLS_115({
                size: (14),
                ...{ class: ({ rotated: __VLS_ctx.isNoteExpanded(doc.id) }) },
            }));
            const __VLS_117 = __VLS_116({
                size: (14),
                ...{ class: ({ rotated: __VLS_ctx.isNoteExpanded(doc.id) }) },
            }, ...__VLS_functionalComponentArgsRest(__VLS_116));
            /** @type {__VLS_StyleScopedClasses['rotated']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "expand-placeholder" },
            });
            /** @type {__VLS_StyleScopedClasses['expand-placeholder']} */ ;
        }
        let __VLS_120;
        /** @ts-ignore @type {typeof __VLS_components.FileText} */
        FileText;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent1(__VLS_120, new __VLS_120({
            size: (14),
            ...{ class: "item-icon doc-icon" },
        }));
        const __VLS_122 = __VLS_121({
            size: (14),
            ...{ class: "item-icon doc-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        /** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
        /** @type {__VLS_StyleScopedClasses['doc-icon']} */ ;
        if (__VLS_ctx.editingNoteId === doc.id) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (__VLS_ctx.submitRenameNote) },
                ...{ onKeyup: (__VLS_ctx.cancelRenameNote) },
                ...{ onBlur: (__VLS_ctx.submitRenameNote) },
                ...{ onClick: () => { } },
                ref: "noteEditInputRef",
                ...{ class: "inline-edit" },
            });
            (__VLS_ctx.editingNoteTitle);
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "item-name" },
            });
            /** @type {__VLS_StyleScopedClasses['item-name']} */ ;
            (doc.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "item-meta" },
            });
            /** @type {__VLS_StyleScopedClasses['item-meta']} */ ;
            (__VLS_ctx.formatDate(doc.updated_at));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    __VLS_ctx.deleteDocument(doc, $event);
                    // @ts-ignore
                    [deleteDocument, isNoteExpanded, editingNoteId, submitRenameNote, submitRenameNote, cancelRenameNote, editingNoteTitle, formatDate,];
                } },
            ...{ class: "delete-btn" },
            title: "Delete",
        });
        /** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
        let __VLS_125;
        /** @ts-ignore @type {typeof __VLS_components.Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_126 = __VLS_asFunctionalComponent1(__VLS_125, new __VLS_125({
            size: (12),
        }));
        const __VLS_127 = __VLS_126({
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_126));
        if (__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "tree-children subnotes" },
            });
            /** @type {__VLS_StyleScopedClasses['tree-children']} */ ;
            /** @type {__VLS_StyleScopedClasses['subnotes']} */ ;
            for (const [subnote] of __VLS_vFor((__VLS_ctx.getNoteChildren(doc.id)))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                return;
                            __VLS_ctx.openDocument(subnote);
                            // @ts-ignore
                            [openDocument, hasNoteChildren, isNoteExpanded, getNoteChildren,];
                        } },
                    ...{ onContextmenu: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                return;
                            __VLS_ctx.showContextMenu($event, 'note', subnote.id);
                            // @ts-ignore
                            [showContextMenu,];
                        } },
                    ...{ onDragstart: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                return;
                            __VLS_ctx.handleDragStart($event, subnote.id, 'note');
                            // @ts-ignore
                            [handleDragStart,];
                        } },
                    ...{ onDragend: (__VLS_ctx.handleDragEnd) },
                    ...{ onDragover: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                return;
                            __VLS_ctx.handleDragOver($event, subnote.id, 'note');
                            // @ts-ignore
                            [handleDragOver, handleDragEnd,];
                        } },
                    ...{ onDragleave: (__VLS_ctx.handleDragLeave) },
                    ...{ onDrop: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                return;
                            __VLS_ctx.handleDrop($event, subnote.id, 'note');
                            // @ts-ignore
                            [handleDragLeave, handleDrop,];
                        } },
                    ...{ class: "tree-item doc-item subnote" },
                    ...{ class: ({
                            active: __VLS_ctx.editorStore.currentDocument?.id === subnote.id,
                            'drag-over': __VLS_ctx.dragState.dropTargetId === subnote.id
                        }) },
                    'data-item-id': (subnote.id),
                    draggable: "true",
                    key: (subnote.id),
                });
                /** @type {__VLS_StyleScopedClasses['tree-item']} */ ;
                /** @type {__VLS_StyleScopedClasses['doc-item']} */ ;
                /** @type {__VLS_StyleScopedClasses['subnote']} */ ;
                /** @type {__VLS_StyleScopedClasses['active']} */ ;
                /** @type {__VLS_StyleScopedClasses['drag-over']} */ ;
                let __VLS_130;
                /** @ts-ignore @type {typeof __VLS_components.CornerDownRight} */
                CornerDownRight;
                // @ts-ignore
                const __VLS_131 = __VLS_asFunctionalComponent1(__VLS_130, new __VLS_130({
                    size: (12),
                    ...{ class: "subnote-indicator" },
                }));
                const __VLS_132 = __VLS_131({
                    size: (12),
                    ...{ class: "subnote-indicator" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_131));
                /** @type {__VLS_StyleScopedClasses['subnote-indicator']} */ ;
                let __VLS_135;
                /** @ts-ignore @type {typeof __VLS_components.FileText} */
                FileText;
                // @ts-ignore
                const __VLS_136 = __VLS_asFunctionalComponent1(__VLS_135, new __VLS_135({
                    size: (14),
                    ...{ class: "item-icon doc-icon" },
                }));
                const __VLS_137 = __VLS_136({
                    size: (14),
                    ...{ class: "item-icon doc-icon" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_136));
                /** @type {__VLS_StyleScopedClasses['item-icon']} */ ;
                /** @type {__VLS_StyleScopedClasses['doc-icon']} */ ;
                if (__VLS_ctx.editingNoteId === subnote.id) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                        ...{ onKeyup: (__VLS_ctx.submitRenameNote) },
                        ...{ onKeyup: (__VLS_ctx.cancelRenameNote) },
                        ...{ onBlur: (__VLS_ctx.submitRenameNote) },
                        ...{ onClick: () => { } },
                        ref: "noteEditInputRef",
                        ...{ class: "inline-edit" },
                    });
                    (__VLS_ctx.editingNoteTitle);
                    /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "item-name" },
                    });
                    /** @type {__VLS_StyleScopedClasses['item-name']} */ ;
                    (subnote.title);
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.sidebarVisible))
                                return;
                            if (!(__VLS_ctx.hasNoteChildren(doc.id) && __VLS_ctx.isNoteExpanded(doc.id)))
                                return;
                            __VLS_ctx.deleteDocument(subnote, $event);
                            // @ts-ignore
                            [dragState, editorStore, deleteDocument, editingNoteId, submitRenameNote, submitRenameNote, cancelRenameNote, editingNoteTitle,];
                        } },
                    ...{ class: "delete-btn" },
                    title: "Delete",
                });
                /** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
                let __VLS_140;
                /** @ts-ignore @type {typeof __VLS_components.Trash2} */
                Trash2;
                // @ts-ignore
                const __VLS_141 = __VLS_asFunctionalComponent1(__VLS_140, new __VLS_140({
                    size: (12),
                }));
                const __VLS_142 = __VLS_141({
                    size: (12),
                }, ...__VLS_functionalComponentArgsRest(__VLS_141));
                // @ts-ignore
                [];
            }
        }
        // @ts-ignore
        [];
    }
    if (__VLS_ctx.generalDocuments.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty-state" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
        if (__VLS_ctx.searchQuery) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel toc-panel" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'toc') }, null, null);
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['toc-panel']} */ ;
    const __VLS_145 = TableOfContents;
    // @ts-ignore
    const __VLS_146 = __VLS_asFunctionalComponent1(__VLS_145, new __VLS_145({}));
    const __VLS_147 = __VLS_146({}, ...__VLS_functionalComponentArgsRest(__VLS_146));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "user-section" },
        ref: "userMenuRef",
    });
    /** @type {__VLS_StyleScopedClasses['user-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.toggleUserMenu) },
        ...{ class: "user-profile-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['user-profile-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "user-avatar" },
    });
    /** @type {__VLS_StyleScopedClasses['user-avatar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.userInitial);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "user-info" },
    });
    /** @type {__VLS_StyleScopedClasses['user-info']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "user-name" },
    });
    /** @type {__VLS_StyleScopedClasses['user-name']} */ ;
    (__VLS_ctx.userDisplayName);
    if (!__VLS_ctx.authStore.isAuthenticated) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "user-badge guest" },
        });
        /** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
        /** @type {__VLS_StyleScopedClasses['guest']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "user-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
    }
    let __VLS_150;
    /** @ts-ignore @type {typeof __VLS_components.ChevronUp} */
    ChevronUp;
    // @ts-ignore
    const __VLS_151 = __VLS_asFunctionalComponent1(__VLS_150, new __VLS_150({
        size: (16),
        ...{ class: "expand-icon" },
        ...{ class: ({ rotated: !__VLS_ctx.showUserMenu }) },
    }));
    const __VLS_152 = __VLS_151({
        size: (16),
        ...{ class: "expand-icon" },
        ...{ class: ({ rotated: !__VLS_ctx.showUserMenu }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_151));
    /** @type {__VLS_StyleScopedClasses['expand-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['rotated']} */ ;
    let __VLS_155;
    /** @ts-ignore @type {typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_156 = __VLS_asFunctionalComponent1(__VLS_155, new __VLS_155({
        name: "slide-up",
    }));
    const __VLS_157 = __VLS_156({
        name: "slide-up",
    }, ...__VLS_functionalComponentArgsRest(__VLS_156));
    const { default: __VLS_160 } = __VLS_158.slots;
    if (__VLS_ctx.showUserMenu) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: () => { } },
            ...{ class: "user-menu" },
        });
        /** @type {__VLS_StyleScopedClasses['user-menu']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "theme-toggle" },
        });
        /** @type {__VLS_StyleScopedClasses['theme-toggle']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    if (!(__VLS_ctx.showUserMenu))
                        return;
                    __VLS_ctx.setTheme('light');
                    // @ts-ignore
                    [activeTab, searchQuery, generalDocuments, toggleUserMenu, userInitial, userDisplayName, authStore, showUserMenu, showUserMenu, setTheme,];
                } },
            ...{ class: ({ active: __VLS_ctx.currentTheme === 'light' }) },
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        let __VLS_161;
        /** @ts-ignore @type {typeof __VLS_components.Sun} */
        Sun;
        // @ts-ignore
        const __VLS_162 = __VLS_asFunctionalComponent1(__VLS_161, new __VLS_161({
            size: (14),
        }));
        const __VLS_163 = __VLS_162({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_162));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    if (!(__VLS_ctx.showUserMenu))
                        return;
                    __VLS_ctx.setTheme('dark');
                    // @ts-ignore
                    [setTheme, currentTheme,];
                } },
            ...{ class: ({ active: __VLS_ctx.currentTheme === 'dark' }) },
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        let __VLS_166;
        /** @ts-ignore @type {typeof __VLS_components.Moon} */
        Moon;
        // @ts-ignore
        const __VLS_167 = __VLS_asFunctionalComponent1(__VLS_166, new __VLS_166({
            size: (14),
        }));
        const __VLS_168 = __VLS_167({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_167));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.sidebarVisible))
                        return;
                    if (!(__VLS_ctx.showUserMenu))
                        return;
                    __VLS_ctx.setTheme('system');
                    // @ts-ignore
                    [setTheme, currentTheme,];
                } },
            ...{ class: ({ active: __VLS_ctx.currentTheme === 'system' }) },
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        let __VLS_171;
        /** @ts-ignore @type {typeof __VLS_components.Monitor} */
        Monitor;
        // @ts-ignore
        const __VLS_172 = __VLS_asFunctionalComponent1(__VLS_171, new __VLS_171({
            size: (14),
        }));
        const __VLS_173 = __VLS_172({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_172));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "menu-divider" },
        });
        /** @type {__VLS_StyleScopedClasses['menu-divider']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.goToSettings) },
            ...{ class: "menu-item" },
        });
        /** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
        let __VLS_176;
        /** @ts-ignore @type {typeof __VLS_components.Settings} */
        Settings;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent1(__VLS_176, new __VLS_176({
            size: (16),
        }));
        const __VLS_178 = __VLS_177({
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "shortcut" },
        });
        /** @type {__VLS_StyleScopedClasses['shortcut']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.closeUserMenu) },
            ...{ class: "menu-item" },
        });
        /** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
        let __VLS_181;
        /** @ts-ignore @type {typeof __VLS_components.MessageCircle} */
        MessageCircle;
        // @ts-ignore
        const __VLS_182 = __VLS_asFunctionalComponent1(__VLS_181, new __VLS_181({
            size: (16),
        }));
        const __VLS_183 = __VLS_182({
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_182));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.closeUserMenu) },
            ...{ class: "menu-item" },
        });
        /** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
        let __VLS_186;
        /** @ts-ignore @type {typeof __VLS_components.Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_187 = __VLS_asFunctionalComponent1(__VLS_186, new __VLS_186({
            size: (16),
        }));
        const __VLS_188 = __VLS_187({
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_187));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "menu-divider" },
        });
        /** @type {__VLS_StyleScopedClasses['menu-divider']} */ ;
        if (__VLS_ctx.authStore.isAuthenticated) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.signOut) },
                ...{ class: "menu-item danger" },
            });
            /** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
            /** @type {__VLS_StyleScopedClasses['danger']} */ ;
            let __VLS_191;
            /** @ts-ignore @type {typeof __VLS_components.LogOut} */
            LogOut;
            // @ts-ignore
            const __VLS_192 = __VLS_asFunctionalComponent1(__VLS_191, new __VLS_191({
                size: (16),
            }));
            const __VLS_193 = __VLS_192({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_192));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.goToAuth) },
                ...{ class: "menu-item primary" },
            });
            /** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
            /** @type {__VLS_StyleScopedClasses['primary']} */ ;
            let __VLS_196;
            /** @ts-ignore @type {typeof __VLS_components.User} */
            User;
            // @ts-ignore
            const __VLS_197 = __VLS_asFunctionalComponent1(__VLS_196, new __VLS_196({
                size: (16),
            }));
            const __VLS_198 = __VLS_197({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_197));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        }
    }
    // @ts-ignore
    [authStore, currentTheme, goToSettings, closeUserMenu, closeUserMenu, signOut, goToAuth,];
    var __VLS_158;
}
let __VLS_201;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_202 = __VLS_asFunctionalComponent1(__VLS_201, new __VLS_201({
    to: "body",
}));
const __VLS_203 = __VLS_202({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_202));
const { default: __VLS_206 } = __VLS_204.slots;
if (__VLS_ctx.contextMenu.show) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: () => { } },
        ...{ class: "context-menu" },
        ...{ style: ({ left: __VLS_ctx.contextMenu.x + 'px', top: __VLS_ctx.contextMenu.y + 'px' }) },
    });
    /** @type {__VLS_StyleScopedClasses['context-menu']} */ ;
    if (__VLS_ctx.contextMenu.type === 'project') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.contextMenu.show))
                        return;
                    if (!(__VLS_ctx.contextMenu.type === 'project'))
                        return;
                    __VLS_ctx.handleContextMenuAction('newNote');
                    // @ts-ignore
                    [contextMenu, contextMenu, contextMenu, contextMenu, handleContextMenuAction,];
                } },
        });
        let __VLS_207;
        /** @ts-ignore @type {typeof __VLS_components.FilePlus} */
        FilePlus;
        // @ts-ignore
        const __VLS_208 = __VLS_asFunctionalComponent1(__VLS_207, new __VLS_207({
            size: (14),
        }));
        const __VLS_209 = __VLS_208({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_208));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.contextMenu.show))
                        return;
                    if (!(__VLS_ctx.contextMenu.type === 'project'))
                        return;
                    __VLS_ctx.handleContextMenuAction('newSubproject');
                    // @ts-ignore
                    [handleContextMenuAction,];
                } },
        });
        let __VLS_212;
        /** @ts-ignore @type {typeof __VLS_components.FolderPlus} */
        FolderPlus;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent1(__VLS_212, new __VLS_212({
            size: (14),
        }));
        const __VLS_214 = __VLS_213({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "menu-divider" },
        });
        /** @type {__VLS_StyleScopedClasses['menu-divider']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.contextMenu.show))
                        return;
                    if (!(__VLS_ctx.contextMenu.type === 'project'))
                        return;
                    __VLS_ctx.handleContextMenuAction('rename');
                    // @ts-ignore
                    [handleContextMenuAction,];
                } },
        });
        let __VLS_217;
        /** @ts-ignore @type {typeof __VLS_components.Edit2} */
        Edit2;
        // @ts-ignore
        const __VLS_218 = __VLS_asFunctionalComponent1(__VLS_217, new __VLS_217({
            size: (14),
        }));
        const __VLS_219 = __VLS_218({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_218));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.contextMenu.show))
                        return;
                    if (!(__VLS_ctx.contextMenu.type === 'project'))
                        return;
                    __VLS_ctx.handleContextMenuAction('delete');
                    // @ts-ignore
                    [handleContextMenuAction,];
                } },
            ...{ class: "danger" },
        });
        /** @type {__VLS_StyleScopedClasses['danger']} */ ;
        let __VLS_222;
        /** @ts-ignore @type {typeof __VLS_components.Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_223 = __VLS_asFunctionalComponent1(__VLS_222, new __VLS_222({
            size: (14),
        }));
        const __VLS_224 = __VLS_223({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_223));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
    else if (__VLS_ctx.contextMenu.type === 'note') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.contextMenu.show))
                        return;
                    if (!!(__VLS_ctx.contextMenu.type === 'project'))
                        return;
                    if (!(__VLS_ctx.contextMenu.type === 'note'))
                        return;
                    __VLS_ctx.handleContextMenuAction('newSubnote');
                    // @ts-ignore
                    [contextMenu, handleContextMenuAction,];
                } },
        });
        let __VLS_227;
        /** @ts-ignore @type {typeof __VLS_components.CornerDownRight} */
        CornerDownRight;
        // @ts-ignore
        const __VLS_228 = __VLS_asFunctionalComponent1(__VLS_227, new __VLS_227({
            size: (14),
        }));
        const __VLS_229 = __VLS_228({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_228));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "menu-divider" },
        });
        /** @type {__VLS_StyleScopedClasses['menu-divider']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.contextMenu.show))
                        return;
                    if (!!(__VLS_ctx.contextMenu.type === 'project'))
                        return;
                    if (!(__VLS_ctx.contextMenu.type === 'note'))
                        return;
                    __VLS_ctx.handleContextMenuAction('rename');
                    // @ts-ignore
                    [handleContextMenuAction,];
                } },
        });
        let __VLS_232;
        /** @ts-ignore @type {typeof __VLS_components.Edit2} */
        Edit2;
        // @ts-ignore
        const __VLS_233 = __VLS_asFunctionalComponent1(__VLS_232, new __VLS_232({
            size: (14),
        }));
        const __VLS_234 = __VLS_233({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_233));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.contextMenu.show))
                        return;
                    if (!!(__VLS_ctx.contextMenu.type === 'project'))
                        return;
                    if (!(__VLS_ctx.contextMenu.type === 'note'))
                        return;
                    __VLS_ctx.handleContextMenuAction('moveToGeneral');
                    // @ts-ignore
                    [handleContextMenuAction,];
                } },
        });
        let __VLS_237;
        /** @ts-ignore @type {typeof __VLS_components.FileText} */
        FileText;
        // @ts-ignore
        const __VLS_238 = __VLS_asFunctionalComponent1(__VLS_237, new __VLS_237({
            size: (14),
        }));
        const __VLS_239 = __VLS_238({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_238));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "menu-divider" },
        });
        /** @type {__VLS_StyleScopedClasses['menu-divider']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.contextMenu.show))
                        return;
                    if (!!(__VLS_ctx.contextMenu.type === 'project'))
                        return;
                    if (!(__VLS_ctx.contextMenu.type === 'note'))
                        return;
                    __VLS_ctx.handleContextMenuAction('delete');
                    // @ts-ignore
                    [handleContextMenuAction,];
                } },
            ...{ class: "danger" },
        });
        /** @type {__VLS_StyleScopedClasses['danger']} */ ;
        let __VLS_242;
        /** @ts-ignore @type {typeof __VLS_components.Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_243 = __VLS_asFunctionalComponent1(__VLS_242, new __VLS_242({
            size: (14),
        }));
        const __VLS_244 = __VLS_243({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_243));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
}
// @ts-ignore
[];
var __VLS_204;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
