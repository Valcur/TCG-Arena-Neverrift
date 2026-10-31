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

async function onCardsUpdate() {
    if (!game.turn.isMyTurn) return
    const row = 2
    const col = 1
    let hasMadeChanges = false
    for (let i = 1; i <= col; i++) {
        for (let j = 1; j <= row; j++) {
            const card = cards?.[`Board_${i}_${j}`]?.[0]
            console.log(`Board_${i}_${j}`, card)
            if (card && card.draggableTokens?.length > 1) {
                card.draggableTokens = [card.draggableTokens[card.draggableTokens.length - 1]];
                hasMadeChanges = true
            }
        }
    }
    if (hasMadeChanges) {
        await functions.repositionCards()
    }
}