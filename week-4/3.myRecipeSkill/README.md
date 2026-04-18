# 🧊 My Recipe Skill

냉장고 재료를 JSON 파일로 관리하고, 보유 재료 기반으로 레시피를 자동 생성하는 Claude Skill입니다.

## 폴더 구조

```
3.myRecipeSkill/
├── ingredients/          # 냉장고 재료 JSON 파일 (재료별 1개 파일)
│   ├── egg.json
│   ├── kimchi.json
│   └── ...
├── recipes/              # 생성된 레시피 마크다운
│   ├── thumbnails/       # 레시피 썸네일 이미지
│   └── *.md
└── README.md
```

## 사용법

### 냉장고 확인
> "냉장고에 뭐 있어?"

### 레시피 요청
> "냉장고 재료로 저녁 뭐 해먹을까?"
> "유통기한 임박한 재료 먼저 써서 요리 만들어줘"

### 재료 관리
> "계란 3개 추가해줘"
> "두부 다 썼어 삭제해줘"
> "우유 500ml 냉장 유통기한 4월 30일로 추가해줘"

## Skill 위치

`.claude/skills/fridge-recipe/SKILL.md`
