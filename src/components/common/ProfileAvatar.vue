<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

interface Props {
  src?: string
  alt: string
  initials?: string
  fallbackIcon?: string
  sizeClass?: string
  bgClass?: string
  iconSizeClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  src: '',
  initials: '',
  fallbackIcon: 'person',
  sizeClass: 'w-10 h-10',
  bgClass: 'bg-primary text-on-primary',
  iconSizeClass: 'text-[18px]'
})

const hasError = shallowRef(false)
const isLoaded = shallowRef(false)

const cleanSrc = computed(() => props.src?.trim() || '')
const isDataUrl = computed(() => cleanSrc.value.startsWith('data:image/'))
const showImage = computed(() => Boolean(cleanSrc.value) && !hasError.value)

watch(
  cleanSrc,
  (next) => {
    hasError.value = false
    isLoaded.value = next.startsWith('data:image/')
  },
  { immediate: true }
)

function onLoad() {
  isLoaded.value = true
}

function onError() {
  hasError.value = true
  isLoaded.value = false
}
</script>

<template>
  <div
    class="relative rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 select-none"
    :class="[sizeClass, bgClass]"
  >
    <img
      v-if="showImage"
      :src="cleanSrc"
      :alt="alt"
      referrerpolicy="no-referrer"
      decoding="async"
      loading="eager"
      class="w-full h-full object-cover transition-opacity duration-200"
      :class="isLoaded || isDataUrl ? 'opacity-100' : 'opacity-0'"
      @load="onLoad"
      @error="onError"
    />

    <div
      v-if="!showImage || (!isLoaded && !isDataUrl)"
      class="absolute inset-0 flex items-center justify-center"
      :class="showImage && !isLoaded && !isDataUrl ? 'animate-pulse' : ''"
    >
      <span v-if="initials" class="font-title-md text-title-md leading-none">
        {{ initials }}
      </span>
      <span
        v-else
        class="material-symbols-outlined leading-none"
        :class="iconSizeClass"
      >
        {{ fallbackIcon }}
      </span>
    </div>
  </div>
</template>
