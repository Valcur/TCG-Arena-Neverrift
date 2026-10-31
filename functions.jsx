async function removeCardProperty() {
    if (!transitionCards || transitionCards.length === 0) return
    await functions.updateCards(transitionCards, {
        draggableTokens:
            [
                {
                    "id": "Orange",
                    "name": "Orange token",
                    "image": "https://valcur.github.io/TCG-Arena-MTG/Images/Tokens/Orange.png",
                    "count": 1
                }
            ]
    })
    for (const card of transitionCards) {
        await functions.giveCardTo(card)
    }
    await functions.repositionCards()
}