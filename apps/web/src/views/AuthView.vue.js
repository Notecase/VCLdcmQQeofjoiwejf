import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores';
const router = useRouter();
const authStore = useAuthStore();
const isLogin = ref(true);
const email = ref('');
const password = ref('');
const isLoading = ref(false);
const error = ref('');
async function handleSubmit() {
    isLoading.value = true;
    error.value = '';
    try {
        if (isLogin.value) {
            await authStore.signIn(email.value, password.value);
        }
        else {
            await authStore.signUp(email.value, password.value);
        }
        router.push('/');
    }
    catch (e) {
        error.value = e.message;
    }
    finally {
        isLoading.value = false;
    }
}
async function handleOAuth(provider) {
    try {
        await authStore.signInWithOAuth(provider);
    }
    catch (e) {
        error.value = e.message;
    }
}
function skipAuth() {
    router.push('/');
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['auth-header']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-header']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['oauth-buttons']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-view" },
});
/** @type {__VLS_StyleScopedClasses['auth-view']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-card" },
});
/** @type {__VLS_StyleScopedClasses['auth-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-header" },
});
/** @type {__VLS_StyleScopedClasses['auth-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-tabs" },
});
/** @type {__VLS_StyleScopedClasses['auth-tabs']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.isLogin = true;
            // @ts-ignore
            [isLogin,];
        } },
    ...{ class: ({ active: __VLS_ctx.isLogin }) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.isLogin = false;
            // @ts-ignore
            [isLogin, isLogin,];
        } },
    ...{ class: ({ active: !__VLS_ctx.isLogin }) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (__VLS_ctx.handleSubmit) },
    ...{ class: "auth-form" },
});
/** @type {__VLS_StyleScopedClasses['auth-form']} */ ;
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.elInput | typeof __VLS_components.ElInput} */
elInput;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.email),
    placeholder: "Email",
    type: "email",
    size: "large",
    required: true,
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.email),
    placeholder: "Email",
    type: "email",
    size: "large",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
/** @ts-ignore @type {typeof __VLS_components.elInput | typeof __VLS_components.ElInput} */
elInput;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    modelValue: (__VLS_ctx.password),
    placeholder: "Password",
    type: "password",
    size: "large",
    showPassword: true,
    required: true,
}));
const __VLS_7 = __VLS_6({
    modelValue: (__VLS_ctx.password),
    placeholder: "Password",
    type: "password",
    size: "large",
    showPassword: true,
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
if (__VLS_ctx.error) {
    let __VLS_10;
    /** @ts-ignore @type {typeof __VLS_components.elAlert | typeof __VLS_components.ElAlert} */
    elAlert;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        title: (__VLS_ctx.error),
        type: "error",
        closable: (false),
    }));
    const __VLS_12 = __VLS_11({
        title: (__VLS_ctx.error),
        type: "error",
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
}
let __VLS_15;
/** @ts-ignore @type {typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components.elButton | typeof __VLS_components.ElButton} */
elButton;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
    type: "primary",
    nativeType: "submit",
    size: "large",
    loading: (__VLS_ctx.isLoading),
    ...{ style: {} },
}));
const __VLS_17 = __VLS_16({
    type: "primary",
    nativeType: "submit",
    size: "large",
    loading: (__VLS_ctx.isLoading),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
const { default: __VLS_20 } = __VLS_18.slots;
(__VLS_ctx.isLogin ? 'Sign In' : 'Sign Up');
// @ts-ignore
[isLogin, isLogin, handleSubmit, email, password, error, error, isLoading,];
var __VLS_18;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-divider" },
});
/** @type {__VLS_StyleScopedClasses['auth-divider']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "oauth-buttons" },
});
/** @type {__VLS_StyleScopedClasses['oauth-buttons']} */ ;
let __VLS_21;
/** @ts-ignore @type {typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components.elButton | typeof __VLS_components.ElButton} */
elButton;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
    ...{ 'onClick': {} },
    size: "large",
}));
const __VLS_23 = __VLS_22({
    ...{ 'onClick': {} },
    size: "large",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
let __VLS_26;
const __VLS_27 = ({ click: {} },
    { onClick: (...[$event]) => {
            __VLS_ctx.handleOAuth('github');
            // @ts-ignore
            [handleOAuth,];
        } });
const { default: __VLS_28 } = __VLS_24.slots;
// @ts-ignore
[];
var __VLS_24;
var __VLS_25;
let __VLS_29;
/** @ts-ignore @type {typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components.elButton | typeof __VLS_components.ElButton} */
elButton;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
    ...{ 'onClick': {} },
    size: "large",
}));
const __VLS_31 = __VLS_30({
    ...{ 'onClick': {} },
    size: "large",
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
let __VLS_34;
const __VLS_35 = ({ click: {} },
    { onClick: (...[$event]) => {
            __VLS_ctx.handleOAuth('google');
            // @ts-ignore
            [handleOAuth,];
        } });
const { default: __VLS_36 } = __VLS_32.slots;
// @ts-ignore
[];
var __VLS_32;
var __VLS_33;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "skip-auth" },
});
/** @type {__VLS_StyleScopedClasses['skip-auth']} */ ;
let __VLS_37;
/** @ts-ignore @type {typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components.elButton | typeof __VLS_components.ElButton} */
elButton;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
    ...{ 'onClick': {} },
    type: "text",
}));
const __VLS_39 = __VLS_38({
    ...{ 'onClick': {} },
    type: "text",
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
let __VLS_42;
const __VLS_43 = ({ click: {} },
    { onClick: (__VLS_ctx.skipAuth) });
const { default: __VLS_44 } = __VLS_40.slots;
// @ts-ignore
[skipAuth,];
var __VLS_40;
var __VLS_41;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
