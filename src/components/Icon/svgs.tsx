import React from "react";
import { Skia } from "@shopify/react-native-skia";

export default {
  moon: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 6C9 10.9706 13.0294 15 18 15C18.9093 15 19.787 14.8655 20.6144 14.6147C19.4943 18.3103 16.0613 20.9999 12 20.9999C7.02944 20.9999 3 16.9707 3 12.0001C3 7.93883 5.69007 4.50583 9.38561 3.38574C9.13484 4.21311 9 5.09074 9 6Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  "play-circle": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g id="Style=Line">
    <g id="Vector">
    <path d="M3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 15V9L15 12L10 15Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    </g>
    </svg>
  `),
  "pause-circle": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 9V15M10 9V15M12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  play: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 17.3336V6.66698C5 5.78742 5 5.34715 5.18509 5.08691C5.34664 4.85977 5.59564 4.71064 5.87207 4.67499C6.18868 4.63415 6.57701 4.84126 7.35254 5.25487L17.3525 10.5882L17.3562 10.5898C18.2132 11.0469 18.642 11.2756 18.7826 11.5803C18.9053 11.8462 18.9053 12.1531 18.7826 12.4189C18.6418 12.7241 18.212 12.9537 17.3525 13.4121L7.35254 18.7454C6.57645 19.1593 6.1888 19.3657 5.87207 19.3248C5.59564 19.2891 5.34664 19.1401 5.18509 18.9129C5 18.6527 5 18.2132 5 17.3336Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  pause: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 5.5V18.5C15 18.9647 15 19.197 15.0384 19.3902C15.1962 20.1836 15.816 20.8041 16.6094 20.9619C16.8026 21.0003 17.0349 21.0003 17.4996 21.0003C17.9642 21.0003 18.1974 21.0003 18.3906 20.9619C19.184 20.8041 19.8041 20.1836 19.9619 19.3902C20 19.1987 20 18.9687 20 18.5122V5.48777C20 5.03125 20 4.80087 19.9619 4.60938C19.8041 3.81599 19.1836 3.19624 18.3902 3.03843C18.197 3 17.9647 3 17.5 3C17.0353 3 16.8026 3 16.6094 3.03843C15.816 3.19624 15.1962 3.81599 15.0384 4.60938C15 4.80257 15 5.03534 15 5.5Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 5.5V18.5C4 18.9647 4 19.197 4.03843 19.3902C4.19624 20.1836 4.81599 20.8041 5.60938 20.9619C5.80257 21.0003 6.0349 21.0003 6.49956 21.0003C6.96421 21.0003 7.19743 21.0003 7.39062 20.9619C8.18401 20.8041 8.8041 20.1836 8.96191 19.3902C9 19.1987 9 18.9687 9 18.5122V5.48777C9 5.03125 9 4.80087 8.96191 4.60938C8.8041 3.81599 8.18356 3.19624 7.39018 3.03843C7.19698 3 6.96465 3 6.5 3C6.03535 3 5.80257 3 5.60938 3.03843C4.81599 3.19624 4.19624 3.81599 4.03843 4.60938C4 4.80257 4 5.03534 4 5.5Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  next: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 5V19M6 10.5713V13.4287C6 15.2557 6 16.1693 6.38355 16.6958C6.71806 17.1549 7.23174 17.4496 7.79688 17.5073C8.44484 17.5733 9.23434 17.113 10.8125 16.1924L13.2617 14.7637L13.2701 14.7588C14.8216 13.8537 15.5979 13.4009 15.8595 12.8105C16.0881 12.2946 16.0881 11.7062 15.8595 11.1902C15.5974 10.5988 14.8188 10.1446 13.2617 9.2363L10.8125 7.80762C9.23434 6.88702 8.44484 6.42651 7.79688 6.49256C7.23174 6.55017 6.71806 6.84556 6.38355 7.30469C6 7.83111 6 8.74424 6 10.5713Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  previous: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 5V19M18 10.5713V13.4287C18 15.2557 17.9998 16.1693 17.6162 16.6958C17.2817 17.1549 16.7679 17.4496 16.2028 17.5073C15.5548 17.5733 14.7656 17.113 13.1875 16.1924L10.7305 14.7592C9.17859 13.8539 8.40224 13.401 8.14062 12.8105C7.91202 12.2946 7.91202 11.7062 8.14062 11.1902C8.40267 10.5988 9.18117 10.1446 10.7383 9.2363L13.1875 7.80762L13.1895 7.80644C14.7663 6.88663 15.5551 6.42653 16.2028 6.49256C16.7679 6.55017 17.2817 6.84556 17.6162 7.30469C17.9998 7.83111 18 8.74424 18 10.5713Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  headphones: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 11C19 7.13401 15.866 4 12 4C8.13401 4 5 7.13401 5 11M16 14.5V16.5C16 16.9647 16 17.197 16.0384 17.3902C16.1962 18.1836 16.8165 18.8041 17.6099 18.9619C17.8031 19.0003 18.0353 19.0003 18.5 19.0003C18.9647 19.0003 19.197 19.0003 19.3902 18.9619C20.1836 18.8041 20.8036 18.1836 20.9614 17.3902C20.9999 17.197 21 16.9647 21 16.5V14.5C21 14.0353 20.9999 13.8026 20.9614 13.6094C20.8036 12.816 20.1836 12.1962 19.3902 12.0384C19.197 12 18.9647 12 18.5 12C18.0353 12 17.8031 12 17.6099 12.0384C16.8165 12.1962 16.1962 12.816 16.0384 13.6094C16 13.8026 16 14.0353 16 14.5ZM8 14.5V16.5C8 16.9647 7.99986 17.197 7.96143 17.3902C7.80361 18.1836 7.18352 18.8041 6.39014 18.9619C6.19694 19.0003 5.96469 19.0003 5.50004 19.0003C5.03539 19.0003 4.80306 19.0003 4.60986 18.9619C3.81648 18.8041 3.19624 18.1836 3.03843 17.3902C3 17.197 3 16.9647 3 16.5V14.5C3 14.0353 3 13.8026 3.03843 13.6094C3.19624 12.816 3.81648 12.1962 4.60986 12.0384C4.80306 12 5.03539 12 5.50004 12C5.9647 12 6.19694 12 6.39014 12.0384C7.18352 12.1962 7.80361 12.816 7.96143 13.6094C7.99986 13.8026 8 14.0353 8 14.5Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  "caret-up-sm": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g id="Style=Line">
    <path id="Vector" d="M9 13L12 10L15 13" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    </svg>
  `),
  "caret-up-md": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g id="Style=Line">
    <path id="Vector" d="M8 14L12 10L16 14" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    </svg>
  `),
  "unordered-list": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g id="Style=Line">
    <path id="Vector" d="M9 17H19M9 12H19M9 7H19M5.00195 17V17.002L5 17.002V17H5.00195ZM5.00195 12V12.002L5 12.002V12H5.00195ZM5.00195 7V7.002L5 7.00195V7H5.00195Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    </svg>
  `),
  "left-arrow": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g id="Style=Line">
    <path id="Vector" d="M19 12H5M5 12L11 18M5 12L11 6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    </svg>
  `),
  help: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 13C12.5533 13 13.0958 12.847 13.5676 12.5579C14.0394 12.2687 14.422 11.8548 14.6731 11.3617C14.9243 10.8687 15.0342 10.3158 14.9907 9.76422C14.9472 9.21262 14.752 8.6838 14.4267 8.23621C14.1014 7.78863 13.6587 7.43974 13.1474 7.22811C12.6362 7.01648 12.0764 6.95036 11.5299 7.03706C10.9834 7.12376 10.4716 7.35991 10.0509 7.71939C9.63032 8.07886 9.3173 8.54767 9.1465 9.07396" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 13V14" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12.0502 17V17.1H11.9502V17H12.0502Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  close: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 18L6 6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 6L5.99997 18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  "swipe-up-down": Skia.SVG.MakeFromString(`
    <svg width="300" height="444" viewBox="0 0 300 444" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M212.5 344L150 406.5L87.5 344" stroke="#D9D9D9" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M150 181.5V406.5" stroke="#D9D9D9" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M212.5 100L150 37.5L87.5 100" stroke="#D9D9D9" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M150 262.5V37.5" stroke="#D9D9D9" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  "swipe-left-right": Skia.SVG.MakeFromString(`
    <svg width="444" height="300" viewBox="0 0 444 300" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M100 212.5L37.5 150L100 87.5" stroke="#D9D9D9" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M262.5 150H37.5" stroke="#D9D9D9" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M344 212.5L406.5 150L344 87.5" stroke="#D9D9D9" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M181.5 150H406.5" stroke="#D9D9D9" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  "single-tap": Skia.SVG.MakeFromString(`
    <svg width="444" height="444" viewBox="0 0 444 444" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M222 444C344.607 444 444 344.607 444 222C444 99.3928 344.607 0 222 0C99.3928 0 0 99.3928 0 222C0 344.607 99.3928 444 222 444ZM222 413C327.486 413 413 327.486 413 222C413 116.514 327.486 31 222 31C116.514 31 31 116.514 31 222C31 327.486 116.514 413 222 413Z" fill="#D9D9D9"/>
    </svg>
  `),
  "double-tap": Skia.SVG.MakeFromString(`
    <svg width="444" height="444" viewBox="0 0 444 444" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M222 444C344.607 444 444 344.607 444 222C444 99.3928 344.607 0 222 0C99.3928 0 0 99.3928 0 222C0 344.607 99.3928 444 222 444ZM222 413C327.486 413 413 327.486 413 222C413 116.514 327.486 31 222 31C116.514 31 31 116.514 31 222C31 327.486 116.514 413 222 413Z" fill="#D9D9D9"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M222 383C310.918 383 383 310.918 383 222C383 133.082 310.918 61 222 61C133.082 61 61 133.082 61 222C61 310.918 133.082 383 222 383ZM222 360.518C298.501 360.518 360.518 298.501 360.518 222C360.518 145.499 298.501 83.482 222 83.482C145.499 83.482 83.482 145.499 83.482 222C83.482 298.501 145.499 360.518 222 360.518Z" fill="#D9D9D9"/>
    </svg>
  `),
  "tap-hold": Skia.SVG.MakeFromString(`
    <svg width="444" height="444" viewBox="0 0 444 444" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="222" cy="222" r="222" fill="#D9D9D9"/>
    </svg>
  `),
  plus: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 12H12M12 12H18M12 12V18M12 12V6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  "plus-stack": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 9V19.4C3 19.9601 3 20.2399 3.10899 20.4538C3.20487 20.642 3.35774 20.7952 3.5459 20.8911C3.7596 21 4.0395 21 4.59846 21H15.0001M14 13V10M14 10V7M14 10H11M14 10H17M7 13.8002V6.2002C7 5.08009 7 4.51962 7.21799 4.0918C7.40973 3.71547 7.71547 3.40973 8.0918 3.21799C8.51962 3 9.08009 3 10.2002 3H17.8002C18.9203 3 19.4801 3 19.9079 3.21799C20.2842 3.40973 20.5905 3.71547 20.7822 4.0918C21.0002 4.51962 21.0002 5.07969 21.0002 6.19978L21.0002 13.7998C21.0002 14.9199 21.0002 15.48 20.7822 15.9078C20.5905 16.2841 20.2842 16.5905 19.9079 16.7822C19.4805 17 18.9215 17 17.8036 17H10.1969C9.07899 17 8.5192 17 8.0918 16.7822C7.71547 16.5905 7.40973 16.2842 7.21799 15.9079C7 15.4801 7 14.9203 7 13.8002Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  "chevron-left": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 19L8 12L15 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  "chevron-right": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5L16 12L9 19" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  edit: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 14V16.8C20 17.9201 20 18.4802 19.782 18.908C19.5903 19.2843 19.2843 19.5903 18.908 19.782C18.4802 20 17.9201 20 16.8 20H7.2C6.07989 20 5.51984 20 5.09202 19.782C4.71569 19.5903 4.40973 19.2843 4.21799 18.908C4 18.4802 4 17.9201 4 16.8V7.2C4 6.07989 4 5.51984 4.21799 5.09202C4.40973 4.71569 4.71569 4.40973 5.09202 4.21799C5.51984 4 6.0799 4 7.2 4H10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 5L19 8M10 14V11L19 2L22 5L13 14H10Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  clipboard: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5C15 6.10457 14.1046 7 13 7H11C9.89543 7 9 6.10457 9 5Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  folder: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9C21 7.89543 20.1046 7 19 7H13L11 5H5C3.89543 5 3 5.89543 3 7Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  trash: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6V17.8C6 18.9201 6 19.4798 6.21799 19.9076C6.40973 20.2839 6.71547 20.5905 7.0918 20.7822C7.5192 21 8.07899 21 9.19691 21H14.8031C15.921 21 16.48 21 16.9074 20.7822C17.2837 20.5905 17.5905 20.2839 17.7822 19.9076C18 19.4802 18 18.921 18 17.8031V6M6 6H8M6 6H4M8 6H16M8 6C8 5.06812 8 4.60241 8.15224 4.23486C8.35523 3.74481 8.74432 3.35523 9.23438 3.15224C9.60192 3 10.0681 3 11 3H13C13.9319 3 14.3978 3 14.7654 3.15224C15.2554 3.35523 15.6447 3.74481 15.8477 4.23486C15.9999 4.6024 16 5.06812 16 6M16 6H18M18 6H20" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  "volume-max": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.82 4.68652C19.8191 5.61821 20.6167 6.74472 21.1636 7.99657C21.7105 9.24842 21.9952 10.5991 21.9999 11.9652C22.0047 13.3313 21.7295 14.6838 21.1914 15.9395C20.6532 17.1951 19.8635 18.3272 18.8709 19.2658M16.092 7.61194C16.6915 8.17095 17.17 8.84686 17.4982 9.59797C17.8263 10.3491 17.9971 11.1595 18 11.9791C18.0028 12.7988 17.8377 13.6103 17.5148 14.3637C17.1919 15.1171 16.7181 15.7963 16.1225 16.3595M7.4803 15.4069L9.15553 17.48C10.0288 18.5607 10.4655 19.1011 10.848 19.1599C11.1792 19.2108 11.5138 19.0925 11.7394 18.8448C12 18.5586 12 17.8638 12 16.4744V7.52572C12 6.13627 12 5.44155 11.7394 5.15536C11.5138 4.90761 11.1792 4.78929 10.848 4.84021C10.4655 4.89904 10.0288 5.43939 9.15553 6.52009L7.4803 8.59319C7.30388 8.81151 7.21567 8.92067 7.10652 8.99922C7.00982 9.06881 6.90147 9.12056 6.78656 9.15204C6.65687 9.18756 6.51652 9.18756 6.23583 9.18756H4.8125C4.0563 9.18756 3.6782 9.18756 3.37264 9.2885C2.77131 9.48716 2.2996 9.95887 2.10094 10.5602C2 10.8658 2 11.2439 2 12.0001C2 12.7563 2 13.1344 2.10094 13.4399C2.2996 14.0413 2.77131 14.513 3.37264 14.7116C3.6782 14.8126 4.0563 14.8126 4.8125 14.8126H6.23583C6.51652 14.8126 6.65687 14.8126 6.78656 14.8481C6.90147 14.8796 7.00982 14.9313 7.10652 15.0009C7.21567 15.0794 7.30388 15.1886 7.4803 15.4069Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
 `),
  "bell-ring": Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 17V18C15 19.6569 13.6569 21 12 21C10.3431 21 9 19.6569 9 18V17M15 17H9M15 17H18.5905C18.973 17 19.1652 17 19.3201 16.9478C19.616 16.848 19.8475 16.6156 19.9473 16.3198C19.9997 16.1643 19.9997 15.9715 19.9997 15.5859C19.9997 15.4172 19.9995 15.3329 19.9863 15.2524C19.9614 15.1004 19.9024 14.9563 19.8126 14.8312C19.7651 14.7651 19.7047 14.7048 19.5858 14.5858L19.1963 14.1963C19.0706 14.0706 19 13.9001 19 13.7224V10C19 6.134 15.866 2.99999 12 3C8.13401 3.00001 5 6.13401 5 10V13.7224C5 13.9002 4.92924 14.0706 4.80357 14.1963L4.41406 14.5858C4.29477 14.7051 4.23504 14.765 4.1875 14.8312C4.09766 14.9564 4.03815 15.1004 4.0132 15.2524C4 15.3329 4 15.4172 4 15.586C4 15.9715 4 16.1642 4.05245 16.3197C4.15225 16.6156 4.3848 16.848 4.68066 16.9478C4.83556 17 5.02701 17 5.40956 17H9M18.0186 2.01367C19.3978 3.05299 20.4843 4.43177 21.1724 6.01574M5.98197 2.01367C4.60275 3.05299 3.5162 4.43177 2.82812 6.01574" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  book: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 19.5002V6.2002C5 5.08009 5 4.51962 5.21799 4.0918C5.40973 3.71547 5.71547 3.40973 6.0918 3.21799C6.51962 3 7.08009 3 8.2002 3H17.4002C17.9602 3 18.2407 3 18.4546 3.10899C18.6427 3.20487 18.7948 3.35774 18.8906 3.5459C18.9996 3.75981 19 4.04005 19 4.6001V16.4001C19 16.9601 18.9996 17.2398 18.8906 17.4537C18.7948 17.6419 18.6429 17.7952 18.4548 17.8911C18.2411 18 17.961 18 17.402 18H7.25C6.00736 18 5 19.0074 5 20.25C5 20.6642 5.33579 21 5.75 21H16.402C16.961 21 17.2411 21 17.4548 20.8911C17.6429 20.7952 17.7948 20.642 17.8906 20.4538C17.9996 20.2399 18 19.9601 18 19.4V18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  image: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.00005 17.0001C3 16.9355 3 16.8689 3 16.8002V7.2002C3 6.08009 3 5.51962 3.21799 5.0918C3.40973 4.71547 3.71547 4.40973 4.0918 4.21799C4.51962 4 5.08009 4 6.2002 4H17.8002C18.9203 4 19.4801 4 19.9079 4.21799C20.2842 4.40973 20.5905 4.71547 20.7822 5.0918C21 5.5192 21 6.07899 21 7.19691V16.8031C21 17.2881 21 17.6679 20.9822 17.9774M3.00005 17.0001C3.00082 17.9884 3.01337 18.5058 3.21799 18.9074C3.40973 19.2837 3.71547 19.5905 4.0918 19.7822C4.5192 20 5.07899 20 6.19691 20H17.8036C18.9215 20 19.4805 20 19.9079 19.7822C20.2842 19.5905 20.5905 19.2837 20.7822 18.9074C20.9055 18.6654 20.959 18.3813 20.9822 17.9774M3.00005 17.0001L7.76798 11.4375L7.76939 11.436C8.19227 10.9426 8.40406 10.6955 8.65527 10.6064C8.87594 10.5282 9.11686 10.53 9.33643 10.6113C9.58664 10.704 9.79506 10.9539 10.2119 11.4541L12.8831 14.6595C13.269 15.1226 13.463 15.3554 13.6986 15.4489C13.9065 15.5313 14.1357 15.5406 14.3501 15.4773C14.5942 15.4053 14.8091 15.1904 15.2388 14.7607L15.7358 14.2637C16.1733 13.8262 16.3921 13.6076 16.6397 13.5361C16.8571 13.4734 17.0896 13.4869 17.2988 13.5732C17.537 13.6716 17.7302 13.9124 18.1167 14.3955L20.9822 17.9774M20.9822 17.9774L21 17.9996M15 10C14.4477 10 14 9.55228 14 9C14 8.44772 14.4477 8 15 8C15.5523 8 16 8.44772 16 9C16 9.55228 15.5523 10 15 10Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  download: Skia.SVG.MakeFromString(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 9V15M12 15L15 13M12 15L9 13M23 15C23 12.7909 21.2091 11 19 11C18.9764 11 18.9532 11.0002 18.9297 11.0006C18.4447 7.60802 15.5267 5 12 5C9.20335 5 6.79019 6.64004 5.66895 9.01082C3.06206 9.18144 1 11.3498 1 13.9999C1 16.7613 3.23858 19.0001 6 19.0001L19 19C21.2091 19 23 17.2091 23 15Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
};
