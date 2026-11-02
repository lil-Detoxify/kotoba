<script setup lang="ts">
import { computed } from 'vue';
import type { Book } from '@jp/models';
import { bookPresentation } from '../services/book-presentation';
const props = defineProps<{ book: Pick<Book, 'id' | 'title' | 'description'>; content?: string }>();
const cover = computed(() => bookPresentation(props.book, props.content));
</script>

<template>
  <div class="cover-object" :class="['cover-' + cover.scene, { 'cover-custom': cover.custom, 'cover-exam': cover.exam }]" aria-hidden="true">
    <div class="cover-spine"></div>
    <div class="cover-type"><small>{{ cover.series }}</small><strong>{{ cover.volume }}</strong><span v-if="!cover.custom || cover.volume.length < 12">{{ cover.caption }}</span></div>
    <svg class="cover-art" viewBox="0 0 240 205" fill="none" focusable="false">
      <template v-if="cover.scene === 'town'">
        <circle cx="180" cy="43" r="30" class="art-sun"/><path d="M0 143L81 91L153 139L240 100V205H0Z" class="art-land"/>
        <path d="M25 128L67 84L109 128V181H25Z" class="art-main"/><path d="M19 128L67 79L115 128" class="art-line"/>
        <path d="M58 145H77V181H58Z" class="art-paper"/><path d="M37 130H51V144H37ZM82 130H96V144H82Z" class="art-accent"/>
        <path d="M139 151V112M132 122Q109 111 118 94Q140 91 139 115M140 129Q164 112 168 133Q156 151 140 142" class="art-line"/>
        <path d="M68 182L131 205H194L78 181" class="art-road"/><path d="M0 189H42M151 182H240" class="art-line"/>
      </template>
      <template v-else-if="cover.scene === 'train'">
        <circle cx="54" cy="45" r="28" class="art-sun"/><path d="M0 147L80 78L171 141L240 114V205H0Z" class="art-land"/>
        <path d="M77 26V135M141 40V136M211 29V136M63 48H223" class="art-line"/>
        <rect x="25" y="92" width="185" height="77" rx="15" class="art-main"/><path d="M25 145H210" class="art-accent-line"/>
        <rect x="42" y="109" width="32" height="27" rx="4" class="art-paper"/><rect x="86" y="109" width="32" height="27" rx="4" class="art-paper"/><rect x="131" y="109" width="27" height="49" rx="4" class="art-paper"/><rect x="169" y="109" width="26" height="27" rx="4" class="art-paper"/>
        <circle cx="64" cy="171" r="9" class="art-dark"/><circle cx="171" cy="171" r="9" class="art-dark"/><path d="M0 183H240M0 195H240" class="art-line"/>
      </template>
      <template v-else-if="cover.scene === 'cafe'">
        <path d="M0 165L240 109V205H0Z" class="art-land"/><rect x="22" y="17" width="106" height="108" rx="53" class="art-main"/>
        <path d="M29 88H122M75 24V121" class="art-line"/><circle cx="99" cy="59" r="19" class="art-sun"/>
        <path d="M10 159H231M42 160L33 205M205 160L216 205" class="art-line"/>
        <path d="M55 153V113Q91 100 122 116Q154 99 187 112V153Q154 140 122 153Q90 141 55 153Z" class="art-paper"/><path d="M122 116V153M64 126L109 129M135 127L174 123M64 136L109 139" class="art-line"/>
        <path d="M155 84H194V106H155Z" class="art-accent"/><path d="M193 88H205Q216 97 205 104H193M165 69Q174 61 168 51M183 68Q191 59 185 50" class="art-line"/>
      </template>
      <template v-else-if="cover.scene === 'bridge'">
        <circle cx="174" cy="40" r="30" class="art-sun"/><path d="M0 136L44 111L116 132L180 89L240 129V205H0Z" class="art-land"/>
        <path d="M0 175H240V205H0Z" class="art-main"/><path d="M0 163H240M54 42V176M184 57V176M48 52H60M178 67H190" class="art-line"/>
        <path d="M0 128Q54 143 54 56Q105 163 184 72Q184 149 240 147M25 135V163M85 107V163M119 121V163M154 112V163M215 139V163" class="art-line"/>
        <path d="M20 185H92M128 190H212M101 181H144" class="art-accent-line"/>
      </template>
      <template v-else-if="cover.scene === 'table'">
        <circle cx="181" cy="43" r="28" class="art-sun"/><path d="M0 130L240 102V205H0Z" class="art-land"/>
        <path d="M9 145H229L241 195H0Z" class="art-main"/><ellipse cx="110" cy="140" rx="67" ry="25" class="art-paper"/><ellipse cx="110" cy="140" rx="47" ry="15" class="art-line"/>
        <path d="M84 136Q109 105 137 136Z" class="art-accent"/><path d="M28 73H74L68 131H34Z" class="art-paper"/>
        <path d="M49 91V53M49 63Q31 56 28 38Q51 35 49 63M50 77Q73 66 77 47Q52 47 50 77" class="art-line"/>
        <path d="M188 90H217V135H188Z" class="art-accent"/><path d="M175 91L161 154M181 93L169 155M198 71Q207 61 201 49" class="art-line"/>
      </template>
      <template v-else-if="cover.scene === 'museum'">
        <circle cx="184" cy="40" r="29" class="art-sun"/><path d="M0 150L111 123L240 143V205H0Z" class="art-land"/>
        <path d="M24 94L117 40L211 94Z" class="art-main"/><path d="M35 102H200V173H35Z" class="art-paper"/>
        <path d="M46 111V163M81 111V163M117 111V163M153 111V163M189 111V163" class="art-column"/><path d="M19 177H216M10 191H225" class="art-line"/>
        <path d="M107 74H127M117 63V84" class="art-accent-line"/>
      </template>
      <template v-else>
        <circle cx="169" cy="46" r="29" class="art-sun"/><path d="M0 158L78 126L240 152V205H0Z" class="art-land"/>
        <path d="M28 169V99Q73 78 119 103Q167 79 213 99V169Q169 148 119 172Q72 147 28 169Z" class="art-paper"/><path d="M119 103V172M46 114L95 121M45 130L95 137M143 121L195 113" class="art-line"/>
        <path d="M121 100V57M121 72Q89 60 94 36Q124 37 121 66M123 88Q153 77 154 51Q124 53 123 82" class="art-main"/>
      </template>
    </svg>
    <div class="cover-imprint"><span>日本語を、少しずつ。</span><b>K</b></div>
    <div class="cover-pages"></div>
  </div>
</template>

<style scoped>
.cover-object{--cover-bg:#e8e9cd;--cover-ink:#324f3c;--cover-main:#67886b;--cover-land:#b9c89a;--cover-accent:#c69253;position:relative;width:176px;aspect-ratio:4/5;background:var(--cover-bg);color:var(--cover-ink);border-radius:3px 8px 8px 3px;box-shadow:4px 8px 0 -2px #c7c5b8,10px 14px 25px -12px #243b3f40;overflow:hidden;transform-origin:50% 85%}
.cover-train{--cover-bg:#dbe6e9;--cover-ink:#264956;--cover-main:#557f90;--cover-land:#adc6c8;--cover-accent:#b9774d}
.cover-cafe{--cover-bg:#e5dfcb;--cover-ink:#554636;--cover-main:#97826a;--cover-land:#c5b894;--cover-accent:#ad6a47}
.cover-bridge{--cover-bg:#dfdfe9;--cover-ink:#46466a;--cover-main:#7e84a1;--cover-land:#b8b3cd;--cover-accent:#a96865}
.cover-table{--cover-bg:#eadccc;--cover-ink:#64412f;--cover-main:#b57859;--cover-land:#ceb39d;--cover-accent:#768267}
.cover-museum{--cover-bg:#d9e4df;--cover-ink:#2e4e49;--cover-main:#5d847b;--cover-land:#a7c5ba;--cover-accent:#ac8658}
.cover-garden{--cover-bg:#e4e6d1;--cover-ink:#3d5238;--cover-main:#759165;--cover-land:#bdcdab;--cover-accent:#ba9361}
.cover-exam .cover-type strong{font:600 36px/1.1 Georgia,serif;letter-spacing:.03em;margin:5px 0}.cover-exam .cover-type span{font-size:8px}.cover-exam .cover-art{height:44%}
.cover-spine{position:absolute;inset:0 auto 0 0;width:11px;background:#26352c15;border-right:1px solid #fff4;z-index:2}.cover-type{position:relative;padding:19px 16px 0 25px;z-index:1}.cover-type small{display:block;font-size:10px;letter-spacing:.07em}.cover-type strong{display:block;font:600 21px/1.5 'Yu Mincho','SimSun',serif;margin:6px 0;overflow-wrap:anywhere}.cover-type span{font-size:9px;display:block}.cover-custom .cover-type strong{font-size:18px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.cover-custom .cover-art{height:50%}.cover-art{position:absolute;bottom:21px;width:100%;height:57%}.art-main{fill:var(--cover-main)}.art-land{fill:var(--cover-land)}.art-sun{fill:var(--cover-accent);opacity:.65}.art-paper{fill:#f7f2e3}.art-accent{fill:var(--cover-accent)}.art-dark{fill:var(--cover-ink)}.art-road{fill:#f7f2e3;opacity:.6}.art-line{stroke:var(--cover-ink);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.art-accent-line{stroke:var(--cover-accent);stroke-width:4;stroke-linecap:round}.art-column{stroke:var(--cover-main);stroke-width:10}.cover-imprint{position:absolute;bottom:12px;left:24px;right:13px;display:flex;align-items:center;justify-content:space-between;font-size:8px}.cover-imprint b{display:grid;place-items:center;width:17px;height:17px;border:1px solid currentColor;border-radius:50%;font:12px Georgia,serif}.cover-pages{position:absolute;bottom:4px;left:11px;right:5px;height:3px;background:#faf8ef;border-radius:2px}
@media(max-width:760px){.cover-object{width:122px}.cover-custom .cover-type strong{font-size:14px}.cover-custom .cover-art{height:40%}.cover-type{padding:12px 10px 0 18px}.cover-type small{font-size:8px}.cover-type strong{font-size:16px;margin:4px 0}.cover-type span{font-size:7px}.cover-imprint{left:18px;right:8px;bottom:9px;font-size:6px}.cover-art{bottom:17px}.cover-imprint b{width:12px;height:12px;font-size:9px}.cover-spine{width:8px}.cover-pages{left:8px}}
@media(max-width:760px){.cover-exam .cover-type strong{font-size:27px;margin:3px 0}.cover-exam .cover-type span{font-size:7px}}
</style>
